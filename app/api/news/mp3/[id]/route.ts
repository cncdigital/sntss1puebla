import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../../../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const [worker, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  if (!worker && !privilege) return new Response(null, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const requestedQuality = new URL(request.url).searchParams.get("quality");
  const quality = requestedQuality === "96" || requestedQuality === "192" ? Number(requestedQuality) : 320;
  const track = await env.DB.prepare(
    `SELECT storage_key AS storageKey,content_type AS contentType
     FROM news_mp3_library WHERE id=? AND active=1`,
  )
    .bind(id)
    .first<{ storageKey: string; contentType: string }>();
  if (!track) return new Response(null, { status: 404 });
  const storageKey = quality === 320 ? track.storageKey : track.storageKey.replace(/\.mp3$/i, `.${quality}.mp3`);
  const object = await env.BUCKET.get(storageKey);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers(NO_STORE_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set("content-type", track.contentType || "audio/mpeg");
  headers.set("content-disposition", "inline");
  headers.set("accept-ranges", "bytes");
  headers.set("x-content-type-options", "nosniff");
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
    if (match) {
      const offset = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : offset + 512 * 1024 - 1;
      const end = Math.min(requestedEnd, object.size - 1);
      if (Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && end >= offset && offset < object.size) {
        const ranged = await env.BUCKET.get(storageKey, { range: { offset, length: end - offset + 1 } });
        if (!ranged) return new Response(null, { status: 404 });
        const partialHeaders = new Headers(headers);
        partialHeaders.set("content-range", `bytes ${offset}-${end}/${object.size}`);
        partialHeaders.set("content-length", String(end - offset + 1));
        return new Response(ranged.body, { status: 206, headers: partialHeaders });
      }
    }
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
