import { env } from "cloudflare:workers";
import { requirePrivilege } from "../authz";

export async function GET(request: Request) {
  if (!(await requirePrivilege(request, "admin")))
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1)
    return Response.json({ error: "Documento inválido" }, { status: 400 });
  const document = await env.DB.prepare(
    "SELECT storage_key AS storageKey,file_name AS fileName FROM application_documents WHERE id=?",
  )
    .bind(id)
    .first<{ storageKey: string; fileName: string }>();
  if (!document)
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  const object = await env.BUCKET.get(document.storageKey);
  if (!object)
    return Response.json({ error: "Archivo no disponible" }, { status: 404 });
  const safeName = document.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeName || "documento.pdf"}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
