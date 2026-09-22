import { env } from "cloudflare:workers";
import { sha256 } from "../../reader/auth";
import {
  getPrivilege,
  getTrustedOwnerPrivilege,
  PRIVILEGED_LOGOUT_COOKIE,
} from "../../authz";
import { effectiveQrFacilities } from "../../../role-policy";
import { isMasterAdministrator } from "../../../master-admin";
import { canCoachProgressLists } from "../../../devi/progress-access";
import { sharedPortalCookieDomain } from "../../worker/identity-auth";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const PERSISTENT_SESSION_SECONDS = 400 * 24 * 60 * 60;

function privilegedSessionCookie(
  token: string,
  maxAge = PERSISTENT_SESSION_SECONDS,
  request?: Request,
  sharedDomain = true,
) {
  return `sntss_privileged=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}${sharedDomain ? sharedPortalCookieDomain(request) : ""}`;
}

function privilegedSessionCookieVariants(
  token: string,
  maxAge: number,
  request: Request,
) {
  return [
    privilegedSessionCookie(token, maxAge, request),
    privilegedSessionCookie(token, maxAge, request, false),
  ].filter((cookie, index, cookies) => cookies.indexOf(cookie) === index);
}

function privilegedLogoutCookie(
  value: string,
  maxAge: number,
  request: Request,
  sharedDomain = true,
) {
  return `${PRIVILEGED_LOGOUT_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}${sharedDomain ? sharedPortalCookieDomain(request) : ""}`;
}

function privilegedLogoutCookieVariants(
  value: string,
  maxAge: number,
  request: Request,
) {
  return [
    privilegedLogoutCookie(value, maxAge, request),
    privilegedLogoutCookie(value, maxAge, request, false),
  ].filter((cookie, index, cookies) => cookies.indexOf(cookie) === index);
}

function requestCookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

function databaseBusyResponse() {
  return Response.json(
    {
      error: "El acceso administrativo está atendiendo varias solicitudes. Intenta nuevamente en un momento.",
      code: "DATABASE_BUSY",
    },
    { status: 503, headers: { ...NO_STORE_HEADERS, "retry-after": "2" } },
  );
}

function storedTimeMs(value: string) {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return Date.parse(hasTimeZone ? value : `${value.replace(" ", "T")}Z`);
}

export async function GET(request: Request) {
  const token = requestCookie(request, "sntss_privileged");
  if (!token && requestCookie(request, PRIVILEGED_LOGOUT_COOKIE) === "1")
    return Response.json(
      { authorized: false },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  let account: Awaited<ReturnType<typeof getPrivilege>>;
  try {
    account = await getPrivilege(request);
  } catch (error) {
    console.error("privileged-session.restore-failed", error);
    return databaseBusyResponse();
  }
  if (!account)
    return Response.json(
      { authorized: false },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  if (token) {
    try {
      await env.DB.prepare(
        "UPDATE privileged_sessions SET expires_at=datetime('now','+400 days') WHERE token=?",
      )
        .bind(token)
        .run();
    } catch (error) {
      console.warn("privileged-session.renewal-delayed", error);
    }
  }
  return Response.json(
    { authorized: true, account },
    {
      headers: {
        ...NO_STORE_HEADERS,
        ...(token ? { "set-cookie": privilegedSessionCookie(token, PERSISTENT_SESSION_SECONDS, request) } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  let body: { matricula?: string; pin?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La solicitud de acceso está vacía o incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const { matricula = "", pin = "" } = body;
  const clean = matricula.replace(/\D/g, "");
  if (!clean)
    return Response.json(
      { error: "Matrícula o contraseña incorrectas." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  const ownerPrivilege = getTrustedOwnerPrivilege(request);
  if (ownerPrivilege && clean === ownerPrivilege.matricula) {
    const headers = new Headers({
      "content-type": "application/json",
      ...NO_STORE_HEADERS,
    });
    for (const cookie of privilegedLogoutCookieVariants("", 0, request))
      headers.append("set-cookie", cookie);
    return new Response(
      JSON.stringify({
        authorized: true,
        account: {
          matricula: ownerPrivilege.matricula,
          canAdmin: ownerPrivilege.canAdmin,
          canReview: ownerPrivilege.canReview,
          canReader: ownerPrivilege.canScan,
          canTrainDevi: ownerPrivilege.canTrainDevi,
          canManageActs: ownerPrivilege.canManageActs,
          canManageScholarships: ownerPrivilege.canManageScholarships,
          canViewFacilityCalendar: ownerPrivilege.canViewFacilityCalendar,
          canManageSportsCalendar: ownerPrivilege.canManageSportsCalendar,
          canManageUnionCalendar: ownerPrivilege.canManageUnionCalendar,
          canChat: ownerPrivilege.canChat,
          canCoachProgress: ownerPrivilege.canCoachProgress,
          mustChangePin: ownerPrivilege.mustChangePin,
          facilities: ownerPrivilege.facilities,
        },
      }),
      { headers },
    );
  }
  const loginSecurity = await env.DB.prepare(
    `SELECT failed_attempts AS failedAttempts,locked_until AS lockedUntil
     FROM privileged_login_security WHERE matricula=? LIMIT 1`,
  )
    .bind(clean)
    .first<{ failedAttempts: number; lockedUntil: string | null }>()
    .catch(() => null);
  if (
    loginSecurity?.lockedUntil &&
    storedTimeMs(loginSecurity.lockedUntil) > Date.now()
  )
    return Response.json(
      {
        error:
          "Acceso protegido temporalmente por varios intentos incorrectos. Espera 15 minutos o solicita al administrador total restablecer el acceso.",
        code: "PRIVILEGED_ACCESS_LOCKED",
      },
      { status: 429, headers: { ...NO_STORE_HEADERS, "retry-after": "900" } },
    );
  let account: {
    matricula: string;
    pinHash: string;
    mustChangePin: number;
    canAdmin: number;
    canReview: number;
    canScan: number;
    canTrainDevi: number;
    canManageActs: number;
    canManageScholarships: number;
    canViewFacilityCalendar: number;
    canManageSportsCalendar: number;
    canManageUnionCalendar: number;
    canChat: number;
    credentialStyle: string;
    facilitiesJson: string;
  } | null;
  try {
    account = await env.DB.prepare(
      `SELECT p.matricula,p.pin_hash AS pinHash,p.must_change_pin AS mustChangePin,
        COALESCE(r.can_admin,p.can_admin,0) AS canAdmin,
        COALESCE(r.can_review,p.can_admin,0) AS canReview,
        COALESCE(r.can_scan,p.can_reader,0) AS canScan,
        COALESCE(r.can_train_devi,p.can_admin,0) AS canTrainDevi,
        COALESCE(r.can_manage_acts,p.can_admin,0) AS canManageActs,
        COALESCE(r.can_manage_scholarships,p.can_admin,0) AS canManageScholarships,
        COALESCE(r.can_view_facility_calendar,p.can_admin,0) AS canViewFacilityCalendar,
        COALESCE(r.can_manage_sports_calendar,p.can_admin,0) AS canManageSportsCalendar,
        COALESCE(r.can_manage_union_calendar,p.can_admin,0) AS canManageUnionCalendar,
        COALESCE(r.can_chat,p.can_admin,0) AS canChat,
        COALESCE(r.credential_style,'standard') AS credentialStyle,
        COALESCE(r.facilities_json,'[]') AS facilitiesJson
       FROM privileged_accounts p
       LEFT JOIN role_assignments r ON r.matricula=p.matricula AND r.active=1
       WHERE p.matricula=? AND p.active=1`,
    )
      .bind(clean)
      .first();
  } catch (error) {
    console.error("privileged-session.lookup-failed", error);
    return databaseBusyResponse();
  }
  if (!account || (await sha256(pin)) !== account.pinHash) {
    const failedAttempts = Number(loginSecurity?.failedAttempts || 0) + 1;
    const lockedUntil =
      failedAttempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;
    await env.DB.prepare(
      `INSERT INTO privileged_login_security
        (matricula,failed_attempts,locked_until,last_failed_at,updated_at)
       VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT(matricula) DO UPDATE SET
        failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until,
        last_failed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
    )
      .bind(clean || "desconocida", failedAttempts, lockedUntil)
      .run()
      .catch((error) => console.error("privileged-login-security-update-failed", error));
    if (lockedUntil)
      await env.DB.prepare(
        `INSERT INTO audit_logs (actor,action,target_type,target_id,detail)
         VALUES ('security-monitor','privileged.login_locked','privileged_account',?,?)`,
      )
        .bind(clean || null, `Cinco intentos fallidos; bloqueo preventivo de 15 minutos.`)
        .run()
        .catch((error) => console.error("privileged-login-lock-audit-failed", error));
    return Response.json(
      {
        error:
          failedAttempts >= 5
            ? "Acceso protegido durante 15 minutos por varios intentos incorrectos."
            : `Matrícula o contraseña incorrectas. Intento ${failedAttempts} de 5.`,
      },
      {
        status: failedAttempts >= 5 ? 429 : 401,
        headers:
          failedAttempts >= 5
            ? { ...NO_STORE_HEADERS, "retry-after": "900" }
            : NO_STORE_HEADERS,
      },
    );
  }
  await env.DB.prepare(
    `INSERT INTO privileged_login_security
      (matricula,failed_attempts,locked_until,last_success_at,updated_at)
     VALUES (?,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET failed_attempts=0,locked_until=NULL,
      last_success_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(clean)
    .run()
    .catch((error) => console.error("privileged-login-security-reset-failed", error));
  const masterAdministrator = isMasterAdministrator(account.matricula);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM privileged_sessions WHERE expires_at<=CURRENT_TIMESTAMP",
      ),
      env.DB.prepare(
        "INSERT INTO privileged_sessions (token,matricula,expires_at) VALUES (?,?,datetime('now','+400 days'))",
      ).bind(token, account.matricula),
    ]);
  } catch (error) {
    console.error("privileged-session.create-failed", error);
    return databaseBusyResponse();
  }
  let facilities: string[] = [];
  try {
    facilities = JSON.parse(account.facilitiesJson) as string[];
  } catch {
    facilities = [];
  }
  facilities = masterAdministrator
    ? ["*"]
    : effectiveQrFacilities(account.credentialStyle, facilities);
  const headers = new Headers({
    "content-type": "application/json",
    ...NO_STORE_HEADERS,
  });
  headers.append(
    "set-cookie",
    privilegedSessionCookie(token, PERSISTENT_SESSION_SECONDS, request),
  );
  for (const cookie of privilegedLogoutCookieVariants("", 0, request))
    headers.append("set-cookie", cookie);
  return new Response(
    JSON.stringify({
      authorized: true,
      account: {
        matricula: account.matricula,
        canAdmin: masterAdministrator || Boolean(account.canAdmin),
        canReview: masterAdministrator || Boolean(account.canReview),
        canReader: masterAdministrator || Boolean(account.canScan),
        canTrainDevi: masterAdministrator || Boolean(account.canTrainDevi),
        canManageActs: masterAdministrator || Boolean(account.canManageActs),
        canManageScholarships:
          masterAdministrator || Boolean(account.canManageScholarships),
        canViewFacilityCalendar:
          masterAdministrator || Boolean(account.canViewFacilityCalendar),
        canManageSportsCalendar:
          masterAdministrator || Boolean(account.canManageSportsCalendar),
        canManageUnionCalendar:
          masterAdministrator || Boolean(account.canManageUnionCalendar),
        canChat: masterAdministrator || Boolean(account.canChat),
        canCoachProgress: canCoachProgressLists(
          account.matricula,
          masterAdministrator || Boolean(account.canAdmin),
          masterAdministrator || Boolean(account.canTrainDevi),
        ),
        mustChangePin: Boolean(account.mustChangePin),
        facilities,
      },
    }),
    { headers },
  );
}

export async function DELETE(request: Request) {
  const cookieName = "sntss_privileged";
  const tokens = (request.headers.get("cookie") || "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${cookieName}=`))
    .map((item) => item.slice(cookieName.length + 1))
    .filter(Boolean)
    .slice(0, 4);
  if (tokens.length) {
    try {
      await env.DB.batch(
        tokens.map((token) =>
          env.DB
            .prepare("DELETE FROM privileged_sessions WHERE token=?")
            .bind(token),
        ),
      );
    } catch (error) {
      console.warn("privileged-session.delete-delayed", error);
    }
  }
  const headers = new Headers(NO_STORE_HEADERS);
  for (const cookie of privilegedSessionCookieVariants("", 0, request))
    headers.append("set-cookie", cookie);
  for (const cookie of privilegedLogoutCookieVariants(
    "1",
    PERSISTENT_SESSION_SECONDS,
    request,
  ))
    headers.append("set-cookie", cookie);
  return new Response(null, { status: 204, headers });
}
