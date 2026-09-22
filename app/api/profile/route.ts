import { env } from "cloudflare:workers";
import { audit, getWorkerSession } from "../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const CURP_PATTERN = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

export async function PATCH(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });

  const payload = (await request.json()) as {
    curp?: string;
    email?: string;
    phone?: string;
  };
  const curp = payload.curp?.trim().toUpperCase() || "";
  const email = payload.email?.trim().toLowerCase() || "";
  const phone = payload.phone?.trim() || null;
  if (!CURP_PATTERN.test(curp))
    return Response.json({ error: "La CURP no tiene un formato válido." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json({ error: "Escribe un correo electrónico válido." }, { status: 400 });

  const application = await env.DB.prepare(
    `SELECT a.id,a.status FROM applications a
     JOIN workers w ON w.id=a.worker_id
     WHERE a.worker_id=? AND a.archived_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(session.workerId)
    .first<{ id: number; status: string }>();
  if (!application || application.status !== "approved")
    return Response.json({ error: "Solo puedes actualizar datos desde una credencial validada." }, { status: 409 });

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE workers SET curp=?,email=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).bind(curp, email, phone, session.workerId),
    env.DB.prepare("UPDATE applications SET curp=?,phone=? WHERE id=?").bind(curp, phone, application.id),
  ]);
  await audit(`matricula:${session.matricula}`, "worker.profile_updated", "application", application.id);
  return Response.json(
    { ok: true, message: "Tus datos se actualizaron correctamente. Tu credencial continúa válida." },
    { headers: NO_STORE_HEADERS },
  );
}
