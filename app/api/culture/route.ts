import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../authz";

const headers = { "cache-control": "public, no-store" };
const kinds = new Set(["curso", "publicacion", "convenio", "turismo"]);
type Row = { id: number; sourcePage: number | null; imageKey: string | null };

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

async function imageFromForm(form: FormData) {
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen no puede superar 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const mime = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : "";
  if (!mime) throw new Error("Sube una imagen JPG, PNG o WebP válida.");
  const key = `culture/${crypto.randomUUID()}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime, cacheControl: "public, max-age=86400" } });
  return key;
}

export async function GET() {
  try {
    const results = await env.DB.prepare(
      `SELECT id,source_page AS sourcePage,kind,title,description,schedule,link_url AS linkUrl,
        image_key AS imageKey,hidden,updated_at AS updatedAt FROM culture_entries ORDER BY updated_at DESC,id DESC`,
    ).all<Record<string, unknown>>();
    return Response.json({ entries: results.results.map(({ imageKey, ...row }) => ({
      ...row,
      imageUrl: imageKey ? `/api/culture/image/${row.id}` : "",
    })) }, { headers });
  } catch (cause) {
    console.error("culture.list-failed", cause);
    return error("No fue posible cargar las publicaciones. Vuelve a intentarlo.", 503);
  }
}

async function write(request: Request, edit: boolean) {
  const privilege = await requirePrivilege(request, "culture");
  if (!privilege) return error("No autorizado para editar Cultura.", 403);
  let form: FormData;
  try { form = await request.formData(); } catch { return error("Formulario inválido."); }
  const kind = String(form.get("kind") || "").trim();
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const schedule = String(form.get("schedule") || "").trim();
  const linkUrl = String(form.get("linkUrl") || "").trim();
  const id = Number(form.get("id") || 0);
  const sourcePage = Number(form.get("sourcePage") || 0);
  if (!kinds.has(kind) || !title || title.length > 130 || description.length > 3000 || schedule.length > 550 || linkUrl.length > 500)
    return error("Revisa el título, el tipo y la extensión del contenido.");
  if (linkUrl && (!/^https:\/\//i.test(linkUrl) || !URL.canParse(linkUrl)))
    return error("El enlace debe comenzar con https://.");
  if (edit && !(Number.isSafeInteger(id) && id > 0) && !(Number.isInteger(sourcePage) && sourcePage >= 1 && sourcePage <= 21))
    return error("Selecciona una publicación existente.");
  if (!edit && (id || sourcePage)) return error("No se puede reutilizar una publicación existente.");
  const current = edit
    ? await env.DB.prepare(`SELECT id,source_page AS sourcePage,image_key AS imageKey FROM culture_entries WHERE ${id > 0 ? "id=?" : "source_page=?"}`).bind(id > 0 ? id : sourcePage).first<Row>()
    : null;
  if (edit && id > 0 && !current) return error("La publicación ya no existe.", 404);
  if (current?.sourcePage && sourcePage && current.sourcePage !== sourcePage) return error("La lámina no coincide.");
  let imageKey: string | null = null;
  let persisted = false;
  try {
    imageKey = await imageFromForm(form);
    const result = current
      ? await env.DB.prepare(`UPDATE culture_entries SET kind=?,title=?,description=?,schedule=?,link_url=?,image_key=?,hidden=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(kind, title, description, schedule, linkUrl, imageKey || current.imageKey, current.id).run()
      : await env.DB.prepare(`INSERT INTO culture_entries (source_page,kind,title,description,schedule,link_url,image_key,hidden,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(edit ? sourcePage : null, kind, title, description, schedule, linkUrl, imageKey, 0, privilege.actor).run();
    persisted = true;
    if (current?.imageKey && imageKey) await env.BUCKET.delete(current.imageKey).catch(() => undefined);
    await audit(privilege.actor, edit ? "culture.updated" : "culture.created", "culture_entry", String(current?.id || result.meta.last_row_id))
      .catch((cause) => console.error("culture.audit-failed", cause));
    return Response.json({ ok: true }, { headers });
  } catch (cause) {
    if (imageKey && !persisted) await env.BUCKET.delete(imageKey).catch(() => undefined);
    console.error("culture.save-failed", cause);
    return error(cause instanceof Error && /imagen|JPG|PNG|WebP/.test(cause.message) ? cause.message : "No fue posible guardar la publicación.", 400);
  }
}

export async function POST(request: Request) { return write(request, false); }
export async function PATCH(request: Request) { return write(request, true); }

export async function DELETE(request: Request) {
  const privilege = await requirePrivilege(request, "culture");
  if (!privilege) return error("No autorizado para editar Cultura.", 403);
  let body: { id?: number; sourcePage?: number };
  try { body = await request.json() as typeof body; } catch { return error("Solicitud inválida."); }
  const id = Number(body.id || 0);
  const sourcePage = Number(body.sourcePage || 0);
  try {
    if (Number.isInteger(sourcePage) && sourcePage >= 1 && sourcePage <= 21) {
      await env.DB.prepare(`INSERT INTO culture_entries (source_page,kind,title,hidden,created_by) VALUES (?,'publicacion','Lámina del folleto',1,?) ON CONFLICT(source_page) DO UPDATE SET hidden=1,updated_at=CURRENT_TIMESTAMP`).bind(sourcePage, privilege.actor).run();
    } else if (Number.isSafeInteger(id) && id > 0) {
      const row = await env.DB.prepare("SELECT id,image_key AS imageKey,source_page AS sourcePage FROM culture_entries WHERE id=?").bind(id).first<Row>();
      if (!row || row.sourcePage) return error("Publicación no encontrada.", 404);
      await env.DB.prepare("DELETE FROM culture_entries WHERE id=?").bind(id).run();
      if (row.imageKey) await env.BUCKET.delete(row.imageKey).catch(() => undefined);
    } else return error("Selecciona una publicación existente.");
    await audit(privilege.actor, "culture.deleted", "culture_entry", String(sourcePage || id));
    return Response.json({ ok: true }, { headers });
  } catch (cause) {
    console.error("culture.delete-failed", cause);
    return error("No fue posible retirar la publicación.", 503);
  }
}
