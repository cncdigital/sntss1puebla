import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../../../../authz";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const [worker, privilege] = await Promise.all([getWorkerSession(request), getPrivilege(request)]);
  if (!worker && !privilege) return new Response(null, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  const track = await env.DB.prepare("SELECT cover_key AS coverKey FROM news_mp3_library WHERE id=? AND active=1")
    .bind(id).first<{ coverKey: string | null }>();
  if (!track?.coverKey) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get(track.coverKey);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "cache-control": "private, no-store", "content-disposition": "inline", "x-content-type-options": "nosniff" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
