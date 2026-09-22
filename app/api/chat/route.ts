import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../authz";

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "chat");
  if (!privilege) return Response.json({ error: "Chat no autorizado" }, { status: 403, headers: NO_STORE });
  await env.DB.prepare(
    `INSERT INTO chat_presence (matricula,is_ghost,last_seen_at) VALUES (?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET is_ghost=excluded.is_ghost,last_seen_at=CURRENT_TIMESTAMP`,
  ).bind(privilege.matricula, privilege.canAdmin ? 1 : 0).run();
  await env.DB.prepare("DELETE FROM chat_presence WHERE last_seen_at < datetime('now','-45 seconds')").run();
  const result = await env.DB.prepare(
    `SELECT c.id,c.matricula,w.full_name AS fullName,r.designation,c.body,c.created_at AS createdAt
     FROM chat_messages c JOIN workers w ON w.matricula=c.matricula
     LEFT JOIN role_assignments r ON r.matricula=c.matricula
     ORDER BY c.id DESC LIMIT 100`,
  ).all<{ id: number; matricula: string; fullName: string; designation: string | null; body: string; createdAt: string }>();
  const online = await env.DB.prepare(
    `SELECT p.matricula,w.full_name AS fullName,r.designation
     FROM chat_presence p
     JOIN workers w ON w.matricula=p.matricula AND w.active=1
     JOIN role_assignments r ON r.matricula=p.matricula AND r.active=1 AND r.can_chat=1
     WHERE p.last_seen_at >= datetime('now','-45 seconds')
       AND p.is_ghost=0 AND COALESCE(r.can_admin,0)=0
     ORDER BY w.full_name COLLATE NOCASE`,
  ).all<{ matricula: string; fullName: string; designation: string | null }>();
  return Response.json({ messages: result.results.reverse(), online: online.results, viewer: privilege.matricula, viewerGhost: privilege.canAdmin }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "chat");
  if (!privilege) return Response.json({ error: "Chat no autorizado" }, { status: 403, headers: NO_STORE });
  await env.DB.prepare(
    `INSERT INTO chat_presence (matricula,is_ghost,last_seen_at) VALUES (?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET is_ghost=excluded.is_ghost,last_seen_at=CURRENT_TIMESTAMP`,
  ).bind(privilege.matricula, privilege.canAdmin ? 1 : 0).run();
  let payload: { body?: string };
  try { payload = (await request.json()) as { body?: string }; } catch { return Response.json({ error: "Mensaje inválido" }, { status: 400, headers: NO_STORE }); }
  const body = payload.body?.trim().replace(/\s+/g, " ") || "";
  if (!body) return Response.json({ error: "Escribe un mensaje." }, { status: 400, headers: NO_STORE });
  if (body.length > 1000) return Response.json({ error: "El mensaje no puede superar 1,000 caracteres." }, { status: 400, headers: NO_STORE });
  await env.DB.prepare("INSERT INTO chat_messages (matricula,body) VALUES (?,?)").bind(privilege.matricula, body).run();
  await audit(privilege.actor, "chat.message_sent", "chat_message", null);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
