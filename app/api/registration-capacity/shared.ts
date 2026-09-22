import { env } from "cloudflare:workers";

export const REGISTRATION_LIMIT = 50;
export const ACTIVE_TTL_MINUTES = 20;

export type RegistrationQueueRow = {
  id: number;
  ticket: string;
  matricula: string;
  applicationId: number | null;
  status: string;
  filesTotal: number;
  filesUploaded: number;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  admittedAt: string | null;
  lastSeenAt: string;
};

export function queueTicketFromRequest(request: Request) {
  return request.headers.get("x-registration-ticket")?.trim() || "";
}

export async function cleanupRegistrationQueue() {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE registration_queue
       SET status='abandoned',completed_at=CURRENT_TIMESTAMP,
         last_error=COALESCE(last_error,'Sesión liberada por inactividad')
       WHERE status='active'
         AND last_seen_at<datetime('now','-${ACTIVE_TTL_MINUTES} minutes')`,
    ),
    env.DB.prepare(
      `UPDATE registration_queue
       SET status='abandoned',completed_at=CURRENT_TIMESTAMP,
         last_error=COALESCE(last_error,'Salida de la sala de espera por inactividad')
       WHERE status='queued' AND last_seen_at<datetime('now','-10 minutes')`,
    ),
  ]);
}

export async function promoteWaitingRegistrations() {
  await env.DB.prepare(
    `UPDATE registration_queue
     SET status='active',admitted_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP
     WHERE id IN (
       SELECT id FROM registration_queue
       WHERE status='queued'
       ORDER BY created_at ASC,id ASC
       LIMIT max(0, ?-(SELECT COUNT(*) FROM registration_queue WHERE status='active'))
     )`,
  )
    .bind(REGISTRATION_LIMIT)
    .run();
}

export async function cleanupAndPromoteRegistrations() {
  await cleanupRegistrationQueue();
  await promoteWaitingRegistrations();
}

export async function touchRegistrationSlot(
  matricula: string,
  ticket: string,
) {
  if (!ticket) return false;
  const active = await env.DB.prepare(
    `UPDATE registration_queue
     SET last_seen_at=CURRENT_TIMESTAMP
     WHERE ticket=? AND matricula=? AND status='active'
       AND last_seen_at>=datetime('now','-${ACTIVE_TTL_MINUTES} minutes')
     RETURNING ticket`,
  )
    .bind(ticket, matricula)
    .first<{ ticket: string }>();
  return Boolean(active);
}

export async function releaseRegistrationSlot(
  matricula: string,
  ticket: string,
  status: "completed" | "abandoned",
  lastError?: string,
) {
  const released = await env.DB.prepare(
    `UPDATE registration_queue
     SET status=?,last_error=?,completed_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP
     WHERE ticket=? AND matricula=? AND status IN ('active','queued')
     RETURNING id`,
  )
    .bind(status, lastError?.slice(0, 500) || null, ticket, matricula)
    .first<{ id: number }>();
  if (released) await promoteWaitingRegistrations();
  return Boolean(released);
}
