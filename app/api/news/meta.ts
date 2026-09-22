import { env } from "cloudflare:workers";
import {
  facebookNewsDate,
  facebookPostToNews,
  type FacebookGraphPost,
  type FacebookNewsRecord,
} from "../../facebook-news";
import type { NewsItem } from "../../noticias-data";

type MetaRuntimeEnvironment = {
  DB: D1Database;
  META_GRAPH_API_VERSION?: string;
  META_PAGE_ID?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_APP_SECRET?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
};

type FacebookNewsRow = {
  facebookPostId: string;
  title: string;
  summary: string;
  category: string;
  permalinkUrl: string;
  imageUrl: string | null;
  publishedAt: string;
};

type SyncStateRow = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type FacebookWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        item?: string;
        verb?: string;
        post_id?: string;
        message?: string;
        created_time?: number;
        from?: { id?: string; name?: string };
      };
    }>;
  }>;
};

const SYNC_STATE_ID = "facebook-page";
const SYNC_MIN_INTERVAL_MS = 2 * 60 * 1_000;
const GRAPH_TIMEOUT_MS = 15_000;
const META_FIELDS =
  "id,message,created_time,updated_time,permalink_url,full_picture,from{id,name}";

function runtimeEnvironment() {
  return env as unknown as MetaRuntimeEnvironment;
}

function graphVersion(value: string | undefined) {
  const candidate = value?.trim() || "";
  return /^v\d{1,2}\.\d$/.test(candidate) ? candidate : "v26.0";
}

export function metaNewsConfiguration() {
  const runtime = runtimeEnvironment();
  const pageId = runtime.META_PAGE_ID?.trim() || "";
  const pageAccessToken = runtime.META_PAGE_ACCESS_TOKEN?.trim() || "";
  const appSecret = runtime.META_APP_SECRET?.trim() || "";
  const verifyToken = runtime.META_WEBHOOK_VERIFY_TOKEN?.trim() || "";
  const syncConfigured = /^\d{5,30}$/.test(pageId) && pageAccessToken.length >= 20;
  return {
    pageId,
    pageAccessToken,
    appSecret,
    verifyToken,
    version: graphVersion(runtime.META_GRAPH_API_VERSION),
    syncConfigured,
    webhookConfigured:
      syncConfigured && appSecret.length >= 20 && verifyToken.length >= 16,
  };
}

function graphUrl(path: string, fields?: string) {
  const configuration = metaNewsConfiguration();
  const url = new URL(
    `https://graph.facebook.com/${configuration.version}/${path.replace(/^\/+/, "")}`,
  );
  if (fields) url.searchParams.set("fields", fields);
  return url;
}

async function graphJson<T>(url: URL): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${metaNewsConfiguration().pageAccessToken}`,
      },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("meta_network_error");
  }
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { code?: number; type?: string } })
    | null;
  if (!response.ok || !payload || payload.error) {
    const code = payload?.error?.code;
    console.warn("facebook-news.graph-unavailable", {
      status: response.status,
      code: typeof code === "number" ? code : null,
    });
    throw new Error(`meta_http_${response.status}`);
  }
  return payload;
}

async function fetchFacebookPost(postId: string) {
  return graphJson<FacebookGraphPost>(graphUrl(postId, META_FIELDS));
}

function upsertStatement(record: FacebookNewsRecord, notifyEligible: boolean, via: string) {
  return runtimeEnvironment().DB.prepare(
    `INSERT INTO facebook_news (
      facebook_post_id,page_id,title,summary,message,category,permalink_url,
      image_url,published_at,source_updated_at,active,notify_eligible,imported_via
    ) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)
    ON CONFLICT(facebook_post_id) DO UPDATE SET
      page_id=excluded.page_id,
      title=excluded.title,
      summary=excluded.summary,
      message=excluded.message,
      category=excluded.category,
      permalink_url=excluded.permalink_url,
      image_url=excluded.image_url,
      published_at=excluded.published_at,
      source_updated_at=excluded.source_updated_at,
      active=1,
      updated_at=CURRENT_TIMESTAMP`,
  ).bind(
    record.facebookPostId,
    record.pageId,
    record.title,
    record.summary,
    record.message,
    record.category,
    record.permalinkUrl,
    record.imageUrl,
    record.publishedAt,
    record.sourceUpdatedAt,
    notifyEligible ? 1 : 0,
    via,
  );
}

async function readSyncState() {
  return runtimeEnvironment().DB.prepare(
    `SELECT last_attempt_at AS lastAttemptAt,last_success_at AS lastSuccessAt,
      last_error AS lastError FROM facebook_news_sync WHERE id=?`,
  )
    .bind(SYNC_STATE_ID)
    .first<SyncStateRow>();
}

async function recordSyncAttempt(now: string) {
  await runtimeEnvironment().DB.prepare(
    `INSERT INTO facebook_news_sync (id,last_attempt_at,updated_at)
     VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,
       updated_at=excluded.updated_at`,
  )
    .bind(SYNC_STATE_ID, now, now)
    .run();
}

async function recordSyncSuccess(now: string, lastPostId: string | null) {
  await runtimeEnvironment().DB.prepare(
    `UPDATE facebook_news_sync SET last_success_at=?,last_error=NULL,last_post_id=?,
      updated_at=? WHERE id=?`,
  )
    .bind(now, lastPostId, now, SYNC_STATE_ID)
    .run();
}

async function recordSyncError(now: string, error: unknown) {
  const reason = error instanceof Error ? error.message.slice(0, 100) : "meta_sync_error";
  await runtimeEnvironment().DB.prepare(
    `UPDATE facebook_news_sync SET last_error=?,updated_at=? WHERE id=?`,
  )
    .bind(reason, now, SYNC_STATE_ID)
    .run();
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncFacebookNews(options: { force?: boolean } = {}) {
  const configuration = metaNewsConfiguration();
  if (!configuration.syncConfigured)
    return { status: "not_configured" as const, processed: 0 };

  const before = await readSyncState();
  if (
    !options.force &&
    before?.lastAttemptAt &&
    Date.now() - timestamp(before.lastAttemptAt) < SYNC_MIN_INTERVAL_MS
  )
    return { status: "recent" as const, processed: 0 };

  const now = new Date().toISOString();
  await recordSyncAttempt(now);
  try {
    const url = graphUrl(`${configuration.pageId}/published_posts`, META_FIELDS);
    url.searchParams.set("limit", "25");
    const payload = await graphJson<{ data?: FacebookGraphPost[] }>(url);
    const initialBackfill = !before?.lastSuccessAt;
    const records = (payload.data || [])
      .map((post) => facebookPostToNews(post, configuration.pageId, now))
      .filter((record): record is FacebookNewsRecord => Boolean(record));
    if (records.length)
      await runtimeEnvironment().DB.batch(
        records.map((record) =>
          upsertStatement(record, !initialBackfill, "page-sync"),
        ),
      );
    await recordSyncSuccess(now, records[0]?.facebookPostId || null);
    return {
      status: initialBackfill ? ("backfilled" as const) : ("synchronized" as const),
      processed: records.length,
    };
  } catch (error) {
    await recordSyncError(now, error);
    return { status: "error" as const, processed: 0 };
  }
}

export async function listFacebookNews(limit = 18) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 30);
  const result = await runtimeEnvironment().DB.prepare(
    `SELECT facebook_post_id AS facebookPostId,title,summary,category,
      permalink_url AS permalinkUrl,image_url AS imageUrl,
      published_at AS publishedAt
     FROM facebook_news WHERE active=1
     ORDER BY published_at DESC,id DESC LIMIT ?`,
  )
    .bind(safeLimit)
    .all<FacebookNewsRow>();
  return result.results.map<NewsItem>((row: FacebookNewsRow, index: number) => ({
    id: `facebook-${row.facebookPostId}`,
    ...facebookNewsDate(row.publishedAt),
    category: row.category,
    title: row.title,
    summary: row.summary,
    sourceUrl: row.permalinkUrl,
    imageUrl: row.imageUrl,
    origin: "facebook",
    featured: index === 0,
  }));
}

export async function facebookNewsPublicStatus() {
  const configuration = metaNewsConfiguration();
  const state = await readSyncState();
  return {
    configured: configuration.syncConfigured,
    webhookConfigured: configuration.webhookConfigured,
    lastSuccessAt: state?.lastSuccessAt || null,
    healthy: !state?.lastError,
  };
}

function bytesFromHex(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return null;
  return Uint8Array.from(value.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyFacebookWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
) {
  const secret = metaNewsConfiguration().appSecret;
  const supplied = bytesFromHex(signatureHeader?.replace(/^sha256=/i, "") || "");
  if (secret.length < 20 || !supplied) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  return constantTimeEqual(expected, supplied);
}

export function verifyFacebookWebhookChallenge(url: URL) {
  const configuration = metaNewsConfiguration();
  const mode = url.searchParams.get("hub.mode") || "";
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (
    configuration.webhookConfigured &&
    mode === "subscribe" &&
    token === configuration.verifyToken &&
    challenge
  )
    return challenge;
  return null;
}

async function deactivatePost(postId: string) {
  await runtimeEnvironment().DB.prepare(
    "UPDATE facebook_news SET active=0,updated_at=CURRENT_TIMESTAMP WHERE facebook_post_id=?",
  )
    .bind(postId)
    .run();
}

export async function processFacebookWebhook(payload: FacebookWebhookPayload) {
  const configuration = metaNewsConfiguration();
  if (!configuration.webhookConfigured || payload.object !== "page")
    return { accepted: 0 };
  let accepted = 0;
  for (const entry of payload.entry || []) {
    if (entry.id !== configuration.pageId) continue;
    for (const change of entry.changes || []) {
      const value = change.value;
      const postId = value?.post_id?.trim() || "";
      if (
        change.field !== "feed" ||
        value?.item !== "post" ||
        !postId.startsWith(`${configuration.pageId}_`)
      )
        continue;
      if (value.verb === "remove") {
        await deactivatePost(postId);
        accepted += 1;
        continue;
      }
      if (value.verb !== "add" && value.verb !== "edited") continue;
      let post: FacebookGraphPost;
      try {
        post = await fetchFacebookPost(postId);
      } catch {
        const created = value.created_time
          ? new Date(value.created_time * 1_000).toISOString()
          : new Date().toISOString();
        post = {
          id: postId,
          message: value.message,
          created_time: created,
          updated_time: created,
          from: value.from,
        };
      }
      const record = facebookPostToNews(post, configuration.pageId);
      if (!record) continue;
      await upsertStatement(record, true, "webhook").run();
      accepted += 1;
    }
  }
  return { accepted };
}
