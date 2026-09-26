import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../../../authz";

const headers = { "cache-control": "private, no-store" };
const MAX_COVER_BYTES = 3 * 1024 * 1024;

function imageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege) return Response.json({ error: "No autorizado" }, { status: 403, headers });
  const form = await request.formData().catch(() => null);
  const id = Number(form?.get("id"));
  const file = form?.get("file");
  if (!Number.isSafeInteger(id) || id < 1 || !(file instanceof File) || !file.size || file.size > MAX_COVER_BYTES)
    return Response.json({ error: "Selecciona una portada JPG, PNG o WebP de hasta 3 MB." }, { status: 400, headers });
  const track = await env.DB.prepare("SELECT cover_key AS coverKey FROM news_mp3_library WHERE id=? AND active=1")
    .bind(id).first<{ coverKey: string | null }>();
  if (!track) return Response.json({ error: "Canción no encontrada." }, { status: 404, headers });
  const data = new Uint8Array(await file.arrayBuffer());
  const type = imageType(data);
  if (!type) return Response.json({ error: "La imagen debe ser JPG, PNG o WebP válido." }, { status: 400, headers });
  const key = `news-mp3/covers/${crypto.randomUUID()}.${type.split("/")[1]}`;
  await env.BUCKET.put(key, data, { httpMetadata: { contentType: type, cacheControl: "private, no-store" } });
  try {
    await env.DB.prepare("UPDATE news_mp3_library SET cover_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1").bind(key, id).run();
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  if (track.coverKey) await env.BUCKET.delete(track.coverKey);
  await audit(privilege.actor, "news_mp3.cover_updated", "news_mp3_library", id, "Portada actualizada");
  return Response.json({ coverUrl: `/api/news/mp3/${id}/cover` }, { headers });
}

export async function DELETE(request: Request) {
  const privilege = await requirePrivilege(request, "news");
  if (!privilege) return Response.json({ error: "No autorizado" }, { status: 403, headers });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Canción no encontrada." }, { status: 400, headers });
  const track = await env.DB.prepare("SELECT cover_key AS coverKey FROM news_mp3_library WHERE id=? AND active=1")
    .bind(id).first<{ coverKey: string | null }>();
  if (!track) return Response.json({ error: "Canción no encontrada." }, { status: 404, headers });
  await env.DB.prepare("UPDATE news_mp3_library SET cover_key=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1").bind(id).run();
  if (track.coverKey) await env.BUCKET.delete(track.coverKey);
  await audit(privilege.actor, "news_mp3.cover_removed", "news_mp3_library", id, "Portada retirada");
  return Response.json({ ok: true }, { headers });
}
