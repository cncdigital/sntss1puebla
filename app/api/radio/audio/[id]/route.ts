import { env } from "cloudflare:workers";

/** Anonymous streaming is limited to active songs; commercial and admin assets stay private. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const track = await env.DB.prepare(
    "SELECT storage_key AS storageKey, content_type AS contentType FROM news_mp3_library WHERE id=? AND kind='song' AND active=1",
  ).bind(id).first<{ storageKey: string; contentType: string }>();
  if (!track) return new Response(null, { status: 404 });
  const requestedQuality = new URL(request.url).searchParams.get("quality");
  const quality = requestedQuality === "96" || requestedQuality === "192" ? Number(requestedQuality) : 320;
  const key = quality === 320 ? track.storageKey : track.storageKey.replace(/\.mp3$/i, `.${quality}.mp3`);
  const object = await env.BUCKET.get(key);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": track.contentType || "audio/mpeg",
    "content-disposition": "inline",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  });
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
    if (match) {
      const offset = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : offset + 512 * 1024 - 1;
      const end = Math.min(requestedEnd, object.size - 1);
      if (Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && end >= offset && offset < object.size) {
        const ranged = await env.BUCKET.get(key, { range: { offset, length: end - offset + 1 } });
        if (!ranged) return new Response(null, { status: 404 });
        headers.set("content-range", `bytes ${offset}-${end}/${object.size}`);
        headers.set("content-length", String(end - offset + 1));
        return new Response(ranged.body, { status: 206, headers });
      }
    }
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
