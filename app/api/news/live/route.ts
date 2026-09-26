import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession, requirePrivilege } from "../../authz";

const HEADERS = { "cache-control": "private, no-store" };
const LIVE_TIMEOUT_MS = 30000;
const MAX_DURATION_MS = 180000;
const MAX_PCM_BYTES = 64000;
type LiveState = { sessionId: string; actor: string; startedAt: number; lastSeenAt: number; lastSequence: number };

async function currentState() {
  return env.DB.prepare("SELECT session_id AS sessionId,actor,started_at AS startedAt,last_seen_at AS lastSeenAt,last_sequence AS lastSequence FROM radio_live_state WHERE id=1").first<LiveState>();
}

function active(state: LiveState | null, now = Date.now()) {
  return Boolean(state?.sessionId && now - state.lastSeenAt < LIVE_TIMEOUT_MS && now - state.startedAt < MAX_DURATION_MS);
}

function storageKey(sessionId: string, sequence: number) {
  return `radio-live/${sessionId}/${sequence}.pcm`;
}

async function cleanup(state: LiveState | null) {
  if (!state?.sessionId || !state.lastSequence) return;
  const keys = Array.from({ length: Math.min(state.lastSequence, 130) }, (_, index) => storageKey(state.sessionId, index + 1));
  await env.BUCKET.delete(keys);
}

function validSession(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function decodeBase64(value: string, codec: string) {
  try {
    if (value.length > MAX_PCM_BYTES * 4 / 3 + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
    const data = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    if (codec === "mulaw8") return data.length >= 500 && data.length <= 32000 ? data : null;
    return data.length >= 1000 && data.length <= MAX_PCM_BYTES && data.length % 2 === 0 ? data : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const [worker, privilege] = await Promise.all([getWorkerSession(request), getPrivilege(request)]);
  if (!worker && !privilege) return Response.json({ error: "No autorizado" }, { status: 401, headers: HEADERS });
  const state = await currentState();
  if (!active(state)) {
    if (state?.sessionId) {
      await env.DB.prepare("UPDATE radio_live_state SET actor='',last_seen_at=0 WHERE id=1 AND session_id=? AND last_seen_at=?")
        .bind(state.sessionId, state.lastSeenAt).run();
      await cleanup(state);
      await env.DB.prepare("UPDATE radio_live_state SET session_id='',last_sequence=0 WHERE id=1 AND session_id=? AND actor=''")
        .bind(state.sessionId).run();
    }
    return Response.json({ active: false }, { headers: HEADERS });
  }
  const url = new URL(request.url);
  const sequence = Number(url.searchParams.get("sequence"));
  if (!url.searchParams.has("sequence")) return Response.json({ active: true, sessionId: state!.sessionId, lastSequence: state!.lastSequence, startedAt: state!.startedAt }, { headers: HEADERS });
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > state!.lastSequence || sequence < state!.lastSequence - 6 || url.searchParams.get("sessionId") !== state!.sessionId)
    return new Response(null, { status: 404, headers: HEADERS });
  const object = await env.BUCKET.get(storageKey(state!.sessionId, sequence));
  if (!object) return new Response(null, { status: 404, headers: HEADERS });
  return new Response(object.body, { headers: { ...HEADERS, "content-type": "application/octet-stream", "x-radio-codec": object.customMetadata?.codec === "mulaw8" ? "mulaw8" : "pcm16", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege) return Response.json({ error: "Solo Administrador y Prensa pueden transmitir." }, { status: 403, headers: HEADERS });
  const body = await request.json().catch(() => null) as { action?: string; sessionId?: string; sequence?: number; codec?: string; pcm?: string } | null;
  if (!body) return Response.json({ error: "Solicitud no válida." }, { status: 400, headers: HEADERS });
  const now = Date.now();
  if (body.action === "start") {
    await env.DB.prepare("INSERT OR IGNORE INTO radio_live_state (id) VALUES (1)").run();
    const previous = await currentState();
    const sessionId = crypto.randomUUID();
    const result = await env.DB.prepare("UPDATE radio_live_state SET session_id=?,actor=?,started_at=?,last_seen_at=?,last_sequence=0 WHERE id=1 AND (session_id='' OR last_seen_at<? OR started_at<?)")
      .bind(sessionId, privilege.actor, now, now, now - LIVE_TIMEOUT_MS, now - MAX_DURATION_MS).run();
    if (!result.meta.changes) return Response.json({ error: "Ya hay un anuncio en vivo. Espera a que termine." }, { status: 409, headers: HEADERS });
    if (previous?.sessionId) await cleanup(previous);
    return Response.json({ sessionId, maxSeconds: MAX_DURATION_MS / 1000 }, { headers: HEADERS });
  }
  if (!validSession(body.sessionId)) return Response.json({ error: "Transmisión no válida." }, { status: 400, headers: HEADERS });
  const state = await currentState();
  if (state?.sessionId !== body.sessionId || state.actor !== privilege.actor)
    return Response.json({ error: "Esta transmisión ya terminó." }, { status: 409, headers: HEADERS });
  if (body.action === "heartbeat") {
    if (!active(state, now)) return Response.json({ error: "La transmisión venció." }, { status: 409, headers: HEADERS });
    await env.DB.prepare("UPDATE radio_live_state SET last_seen_at=? WHERE id=1 AND session_id=? AND actor=?")
      .bind(now, state.sessionId, privilege.actor).run();
    return Response.json({ ok: true }, { headers: HEADERS });
  }
  if (body.action === "stop") {
    await env.DB.prepare("UPDATE radio_live_state SET actor='',last_seen_at=0 WHERE id=1 AND session_id=? AND actor=?")
      .bind(body.sessionId, privilege.actor).run();
    await cleanup(state);
    await env.DB.prepare("UPDATE radio_live_state SET session_id='',last_sequence=0 WHERE id=1 AND session_id=? AND actor=''")
      .bind(body.sessionId).run();
    return Response.json({ ok: true }, { headers: HEADERS });
  }
  if (body.action !== "chunk" || !active(state, now) || !Number.isSafeInteger(body.sequence) || body.sequence !== state.lastSequence + 1 || typeof body.pcm !== "string")
    return Response.json({ error: "El anuncio terminó o el fragmento está fuera de orden." }, { status: 409, headers: HEADERS });
  const codec = body.codec === "mulaw8" ? "mulaw8" : "pcm16";
  const bytes = decodeBase64(body.pcm, codec);
  if (!bytes) return Response.json({ error: "Audio no válido." }, { status: 400, headers: HEADERS });
  const key = storageKey(state.sessionId, body.sequence);
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" }, customMetadata: { codec } });
  const saved = await env.DB.prepare("UPDATE radio_live_state SET last_sequence=?,last_seen_at=? WHERE id=1 AND session_id=? AND actor=? AND last_sequence=?")
    .bind(body.sequence, Date.now(), state.sessionId, privilege.actor, state.lastSequence).run();
  if (!saved.meta.changes) {
    await env.BUCKET.delete(key);
    return Response.json({ error: "La transmisión cambió. Vuelve a iniciar." }, { status: 409, headers: HEADERS });
  }
  return Response.json({ ok: true, sequence: body.sequence }, { headers: HEADERS });
}
