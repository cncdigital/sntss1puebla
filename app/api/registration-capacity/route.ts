import { env } from "cloudflare:workers";
import { getWorkerSession, requirePrivilege } from "../authz";
import {
  cleanupAndPromoteRegistrations,
  promoteWaitingRegistrations,
  REGISTRATION_LIMIT,
  releaseRegistrationSlot,
  type RegistrationQueueRow,
} from "./shared";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const ROW_SELECT = `id,ticket,matricula,application_id AS applicationId,status,
  files_total AS filesTotal,files_uploaded AS filesUploaded,retry_count AS retryCount,
  last_error AS lastError,created_at AS createdAt,admitted_at AS admittedAt,
  last_seen_at AS lastSeenAt`;

async function ticketPayload(row: RegistrationQueueRow) {
  const totals = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS waiting
     FROM registration_queue`,
  ).first<{ active: number | null; waiting: number | null }>();
  let position = 0;
  if (row.status === "queued") {
    const queued = await env.DB.prepare(
      `SELECT COUNT(*) AS position FROM registration_queue
       WHERE status='queued' AND (created_at<? OR (created_at=? AND id<=?))`,
    )
      .bind(row.createdAt, row.createdAt, row.id)
      .first<{ position: number }>();
    position = Number(queued?.position || 0);
  }
  return {
    ticket: row.ticket,
    status: row.status,
    position,
    active: Number(totals?.active || 0),
    waiting: Number(totals?.waiting || 0),
    limit: REGISTRATION_LIMIT,
    filesTotal: row.filesTotal,
    filesUploaded: row.filesUploaded,
    retryCount: row.retryCount,
  };
}

async function workerTicket(matricula: string, ticket: string) {
  return env.DB.prepare(
    `SELECT ${ROW_SELECT} FROM registration_queue WHERE ticket=? AND matricula=? LIMIT 1`,
  )
    .bind(ticket, matricula)
    .first<RegistrationQueueRow>();
}

async function adminCapacity() {
  const summary = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status='completed' AND date(completed_at)=date('now') THEN 1 ELSE 0 END) AS completedToday,
      SUM(CASE WHEN status='abandoned' AND date(completed_at)=date('now') THEN 1 ELSE 0 END) AS pausedToday,
      COALESCE(SUM(CASE WHEN date(created_at)=date('now') THEN retry_count ELSE 0 END),0) AS retriesToday
     FROM registration_queue`,
  ).first<{
    active: number | null;
    waiting: number | null;
    completedToday: number | null;
    pausedToday: number | null;
    retriesToday: number | null;
  }>();
  const live = await env.DB.prepare(
    `SELECT q.matricula,w.full_name AS fullName,q.status,
      q.files_total AS filesTotal,q.files_uploaded AS filesUploaded,
      q.retry_count AS retryCount,q.created_at AS createdAt,q.admitted_at AS admittedAt,
      q.last_seen_at AS lastSeenAt
     FROM registration_queue q
     LEFT JOIN workers w ON w.matricula=q.matricula
     WHERE q.status IN ('active','queued')
     ORDER BY CASE q.status WHEN 'active' THEN 0 ELSE 1 END,q.created_at ASC
     LIMIT 100`,
  ).all<Record<string, unknown>>();
  return {
    limit: REGISTRATION_LIMIT,
    active: Number(summary?.active || 0),
    waiting: Number(summary?.waiting || 0),
    completedToday: Number(summary?.completedToday || 0),
    pausedToday: Number(summary?.pausedToday || 0),
    retriesToday: Number(summary?.retriesToday || 0),
    live: live.results,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "admin") {
    const privilege = await requirePrivilege(request, "review");
    if (!privilege)
      return Response.json({ error: "No autorizado" }, { status: 403, headers: NO_STORE_HEADERS });
    // La limpieza y promoción se ejecuta cuando un trabajador usa su turno.
    // El tablero administrativo queda como una lectura ligera, sin escrituras
    // periódicas que compitan con el registro de documentos.
    return Response.json(await adminCapacity(), { headers: NO_STORE_HEADERS });
  }
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  const ticket = url.searchParams.get("ticket")?.trim() || "";
  if (!ticket)
    return Response.json({ error: "Turno de registro inválido." }, { status: 400 });
  await cleanupAndPromoteRegistrations();
  let row = await workerTicket(session.matricula, ticket);
  if (!row || !["active", "queued"].includes(row.status))
    return Response.json({ error: "El turno terminó. Solicita uno nuevo.", code: "TICKET_ENDED" }, { status: 410 });
  await env.DB.prepare(
    "UPDATE registration_queue SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(row.id)
    .run();
  await promoteWaitingRegistrations();
  row = (await workerTicket(session.matricula, ticket)) || row;
  return Response.json(await ticketPayload(row), { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  await cleanupAndPromoteRegistrations();
  let row = await env.DB.prepare(
    `SELECT ${ROW_SELECT} FROM registration_queue
     WHERE matricula=? AND status IN ('active','queued')
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(session.matricula)
    .first<RegistrationQueueRow>();
  if (row) {
    await env.DB.prepare(
      "UPDATE registration_queue SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(row.id)
      .run();
    return Response.json(await ticketPayload(row), {
      status: row.status === "active" ? 200 : 202,
      headers: NO_STORE_HEADERS,
    });
  }
  const ticket = `REG-${crypto.randomUUID()}`;
  try {
    row = await env.DB.prepare(
      `INSERT INTO registration_queue(ticket,matricula,status,admitted_at,last_seen_at)
       SELECT ?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       WHERE (SELECT COUNT(*) FROM registration_queue WHERE status='active')<?
         AND NOT EXISTS(SELECT 1 FROM registration_queue WHERE status='queued')
       RETURNING ${ROW_SELECT}`,
    )
      .bind(ticket, session.matricula, REGISTRATION_LIMIT)
      .first<RegistrationQueueRow>();
    if (!row)
      row = await env.DB.prepare(
        `INSERT INTO registration_queue(ticket,matricula,status,last_seen_at)
         VALUES (?,?,'queued',CURRENT_TIMESTAMP) RETURNING ${ROW_SELECT}`,
      )
        .bind(ticket, session.matricula)
        .first<RegistrationQueueRow>();
  } catch {
    row = await env.DB.prepare(
      `SELECT ${ROW_SELECT} FROM registration_queue
       WHERE matricula=? AND status IN ('active','queued') ORDER BY id DESC LIMIT 1`,
    )
      .bind(session.matricula)
      .first<RegistrationQueueRow>();
  }
  if (!row)
    return Response.json({ error: "No fue posible asignar un turno de registro." }, { status: 503 });
  return Response.json(await ticketPayload(row), {
    status: row.status === "active" ? 201 : 202,
    headers: NO_STORE_HEADERS,
  });
}

export async function PATCH(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  const payload = (await request.json()) as {
    ticket?: string;
    action?: "progress" | "completed" | "paused";
    applicationId?: number;
    filesTotal?: number;
    filesUploaded?: number;
    retryCount?: number;
    lastError?: string;
  };
  const ticket = payload.ticket?.trim() || "";
  const row = await workerTicket(session.matricula, ticket);
  if (!row || !["active", "queued"].includes(row.status))
    return Response.json({ error: "El turno de registro ya terminó." }, { status: 410 });
  if (payload.action === "progress") {
    if (row.status !== "active")
      return Response.json({ error: "El turno aún está en espera." }, { status: 409 });
    await env.DB.prepare(
      `UPDATE registration_queue SET application_id=COALESCE(?,application_id),
        files_total=max(0,?),files_uploaded=max(0,min(?,?)),retry_count=max(0,?),
        last_error=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?`,
    )
      .bind(
        payload.applicationId || null,
        Math.min(27, Number(payload.filesTotal || 0)),
        Number(payload.filesUploaded || 0),
        Math.min(27, Number(payload.filesTotal || 0)),
        Math.min(99, Number(payload.retryCount || 0)),
        payload.lastError?.slice(0, 500) || null,
        row.id,
      )
      .run();
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }
  if (payload.action === "completed" || payload.action === "paused") {
    await releaseRegistrationSlot(
      session.matricula,
      ticket,
      payload.action === "completed" ? "completed" : "abandoned",
      payload.lastError,
    );
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }
  return Response.json({ error: "Acción inválida." }, { status: 400 });
}
