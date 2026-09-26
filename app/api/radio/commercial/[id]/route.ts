import { env } from "cloudflare:workers";

/** Only active commercial audio intended for the public radio; never serves private uploads. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const track = await env.DB.prepare(
    "SELECT storage_key AS storageKey,content_type AS contentType FROM news_mp3_library WHERE id=? AND kind='commercial' AND active=1",
  ).bind(id).first<{ storageKey: string; contentType: string }>();
  if (!track) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(track.storageKey);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    "cache-control": "no-store", "content-type": track.contentType || "audio/mpeg",
    "content-disposition": "inline", "accept-ranges": "bytes", "x-content-type-options": "nosniff",
  });
  const match = /^bytes=(\d+)-(\d*)$/i.exec(request.headers.get("range") || "");
  if (match) {
    const offset = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : offset + 512 * 1024 - 1, object.size - 1);
    if (Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && end >= offset && offset < object.size) {
      const ranged = await env.BUCKET.get(track.storageKey, { range: { offset, length: end - offset + 1 } });
      if (!ranged) return new Response(null, { status: 404 });
      headers.set("content-range", `bytes ${offset}-${end}/${object.size}`);
      headers.set("content-length", String(end - offset + 1));
      return new Response(ranged.body, { status: 206, headers });
    }
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
