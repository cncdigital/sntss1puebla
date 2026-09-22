import { env } from "cloudflare:workers";

async function adminAllowed(request: Request) {
  const email =
    request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ??
    "";
  if (email === "guardiandelallama@gmail.com") return true;
  const token =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("sntss_privileged="))
      ?.slice(17) ?? "";
  if (!token) return false;
  const account = await env.DB.prepare(
    "SELECT p.matricula FROM privileged_sessions s JOIN privileged_accounts p ON p.matricula=s.matricula WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP AND p.active=1 AND p.can_admin=1",
  )
    .bind(token)
    .first();
  return Boolean(account);
}

export async function GET(request: Request) {
  if (!(await adminAllowed(request)))
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
