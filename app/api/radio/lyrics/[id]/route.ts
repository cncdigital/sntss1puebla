import { env } from "cloudflare:workers";

/** Lyrics for the phone companion screen, limited to active public songs. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const song = await env.DB.prepare(
    "SELECT lyrics FROM news_mp3_library WHERE id=? AND kind='song' AND active=1",
  ).bind(id).first<{ lyrics: string | null }>();
  if (!song) return new Response(null, { status: 404 });
  return Response.json({ lyrics: (song.lyrics || "").slice(0, 12_000) }, {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
