import { env } from "cloudflare:workers";
import { audit } from "../authz";
import { canCoachProgressLists } from "../../devi/progress-access";

export const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

// Los navegadores limitan las cookies persistentes a cerca de 400 días.
// La sesión se renueva al volver a abrir la app y solo se elimina desde
// el botón explícito "Cerrar sesión".
export const PERSISTENT_SESSION_SECONDS = 400 * 24 * 60 * 60;

export type WorkerAuthRecord = {
  id: number;
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  curp: string | null;
  identityCurp: string | null;
  nss: string | null;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  iterations: number | null;
  failedAttempts: number | null;
  passwordLocked: number;
  adminValidated: number;
};

export function requestCookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function sharedPortalCookieDomain(request?: Request) {
  if (!request) return "";
  const hostname = new URL(request.url).hostname.toLocaleLowerCase("en-US");
  return hostname === "sntss1puebla.com" || hostname.endsWith(".sntss1puebla.com")
    ? "; Domain=sntss1puebla.com"
    : "";
}

export function workerSessionCookie(
  token: string,
  maxAge = PERSISTENT_SESSION_SECONDS,
  request?: Request,
) {
  return `sntss_worker=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}${sharedPortalCookieDomain(request)}`;
}

// Al migrar al dominio oficial pueden coexistir una cookie antigua ligada al
// host y la cookie compartida con los subdominios. El cierre debe expirar las
// dos variantes para que ninguna sesión reaparezca al volver a abrir la PWA.
export function expiredWorkerSessionCookies(request: Request) {
  return [
    workerSessionCookie("", 0, request),
    workerSessionCookie("", 0),
  ].filter((cookie, index, cookies) => cookies.indexOf(cookie) === index);
}

export function workerLogoutCookie(
  value: string,
  maxAge: number,
  request: Request,
  sharedDomain = true,
) {
  return `sntss_worker_logged_out=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}${sharedDomain ? sharedPortalCookieDomain(request) : ""}`;
}

export function workerLogoutCookieVariants(
  value: string,
  maxAge: number,
  request: Request,
) {
  return [
    workerLogoutCookie(value, maxAge, request),
    workerLogoutCookie(value, maxAge, request, false),
  ].filter((cookie, index, cookies) => cookies.indexOf(cookie) === index);
}

export function appendWorkerLoginCookies(
  headers: Headers,
  token: string,
  request: Request,
) {
  headers.append("set-cookie", workerSessionCookie(token, PERSISTENT_SESSION_SECONDS, request));
  for (const cookie of workerLogoutCookieVariants("", 0, request))
    headers.append("set-cookie", cookie);
}

export function googleStateCookie(token: string, maxAge = 600, request?: Request) {
  return `sntss_worker_auth_state=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}${sharedPortalCookieDomain(request)}`;
}

export async function findWorkerForAuthentication(matricula: string) {
  return env.DB.prepare(
    `SELECT w.id,w.matricula,w.full_name AS fullName,w.unit,w.category,w.curp,w.nss,
      w.email,w.phone,wp.password_hash AS passwordHash,
      wp.password_salt AS passwordSalt,wp.iterations,
      wp.failed_attempts AS failedAttempts,
      CASE WHEN wp.locked_until>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS passwordLocked,
      COALESCE(
        NULLIF(UPPER(TRIM(w.curp)),''),
        (
          SELECT NULLIF(UPPER(TRIM(a.curp)),'')
          FROM applications a
          WHERE a.worker_id=w.id AND a.archived_at IS NULL
            AND (a.status='approved' OR a.admin_validated=1)
          ORDER BY a.id DESC LIMIT 1
        )
      ) AS identityCurp
      ,CASE WHEN EXISTS(
        SELECT 1 FROM applications validated_application
        WHERE validated_application.worker_id=w.id
          AND validated_application.archived_at IS NULL
          AND validated_application.admin_validated=1
      ) THEN 1 ELSE 0 END AS adminValidated
     FROM workers w LEFT JOIN worker_passwords wp ON wp.matricula=w.matricula
     WHERE w.matricula=? AND w.active=1`,
  )
    .bind(matricula)
    .first<WorkerAuthRecord>();
}

export async function identityAccessLocked(matricula: string) {
  const row = await env.DB.prepare(
    `SELECT CASE WHEN locked_until>CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS locked
     FROM worker_identity_access WHERE matricula=?`,
  )
    .bind(matricula)
    .first<{ locked: number }>();
  return Boolean(row?.locked);
}

export async function noteIdentityFailure(
  matricula: string,
  method: "email_curp" | "google",
) {
  await env.DB.prepare(
    `INSERT INTO worker_identity_access
      (matricula,failed_attempts,locked_until,last_failed_at,updated_at)
     VALUES (?,1,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET
       failed_attempts=CASE
         WHEN worker_identity_access.locked_until IS NOT NULL
           AND worker_identity_access.locked_until<=CURRENT_TIMESTAMP THEN 1
         ELSE worker_identity_access.failed_attempts+1
       END,
       locked_until=CASE
         WHEN (CASE
           WHEN worker_identity_access.locked_until IS NOT NULL
             AND worker_identity_access.locked_until<=CURRENT_TIMESTAMP THEN 1
           ELSE worker_identity_access.failed_attempts+1
         END)>=5 THEN datetime('now','+15 minutes')
         ELSE NULL
       END,
       last_failed_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(matricula)
    .run();
  await audit(
    `matricula:${matricula}`,
    "worker.identity_failed",
    "worker",
    matricula,
    method,
  );
  return identityAccessLocked(matricula);
}

export async function resetIdentityFailures(matricula: string) {
  await env.DB.prepare(
    `INSERT INTO worker_identity_access
      (matricula,failed_attempts,locked_until,last_success_at,updated_at)
     VALUES (?,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET
       failed_attempts=0,locked_until=NULL,last_success_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(matricula)
    .run();
}

export async function createWorkerSession(worker: WorkerAuthRecord) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM worker_sessions WHERE expires_at<=CURRENT_TIMESTAMP",
    ),
    env.DB.prepare(
      "INSERT INTO worker_sessions (token,matricula,expires_at) VALUES (?,?,datetime('now','+400 days'))",
    ).bind(token, worker.matricula),
  ]);
  return {
    token,
    worker: {
      id: worker.id,
      matricula: worker.matricula,
      fullName: worker.fullName,
      unit: worker.unit,
      category: worker.category,
      curp: worker.curp,
      nss: worker.nss,
      email: worker.email,
      phone: worker.phone,
      canCoachProgress: canCoachProgressLists(worker.matricula),
    },
  };
}

export async function bindWorkerEmailIfMissing(
  worker: WorkerAuthRecord,
  email: string,
) {
  if (worker.email?.trim()) return false;
  await env.DB.prepare(
    `UPDATE workers SET email=?,updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND (email IS NULL OR trim(email)='')`,
  )
    .bind(email, worker.id)
    .run();
  worker.email = email;
  await audit(
    `matricula:${worker.matricula}`,
    "worker.identity_email_bound",
    "worker",
    worker.id,
    "correo confirmado con CURP",
  );
  return true;
}

export async function markGoogleIdentity(
  worker: WorkerAuthRecord,
  email: string,
  name: string,
) {
  await env.DB.prepare(
    `UPDATE applications
     SET social_verified=1,social_email=?,social_name=?
     WHERE id=(SELECT id FROM applications WHERE worker_id=? AND archived_at IS NULL ORDER BY id DESC LIMIT 1)`,
  )
    .bind(email, name || email, worker.id)
    .run();
  await audit(
    `matricula:${worker.matricula}`,
    "worker.google_identity_verified",
    "worker",
    worker.id,
    "correo verificado",
  );
}
