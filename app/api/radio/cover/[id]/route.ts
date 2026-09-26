import { env } from "cloudflare:workers";

/** Public cover for active listening songs only. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const song = await env.DB.prepare(
    "SELECT cover_key AS coverKey FROM news_mp3_library WHERE id=? AND active=1 AND kind='song'",
  ).bind(id).first<{ coverKey: string | null }>();
  if (!song?.coverKey) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(song.coverKey);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "content-disposition": "inline" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
