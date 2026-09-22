import { env } from "cloudflare:workers";
import { getWorkerSession, audit } from "../../authz";
import {
  constantTimeEqual,
  derivePasswordHash,
  PASSWORD_ITERATIONS,
} from "../password-crypto";
import { canCoachProgressLists } from "../../../devi/progress-access";
import {
  identityDetailsMatch,
  normalizeAccessCurp,
  normalizeAccessEmail,
  normalizeMatricula,
  validAccessCurp,
  validAccessEmail,
} from "../../../worker-identity";
import {
  createWorkerSession,
  expiredWorkerSessionCookies,
  findWorkerForAuthentication,
  identityAccessLocked,
  NO_STORE_HEADERS,
  noteIdentityFailure,
  PERSISTENT_SESSION_SECONDS,
  resetIdentityFailures,
  workerLogoutCookieVariants,
  workerSessionCookie,
  appendWorkerLoginCookies,
  bindWorkerEmailIfMissing,
} from "../identity-auth";

function databaseBusyResponse() {
  return Response.json(
    {
      error:
        "El padrón está atendiendo varias solicitudes. Estamos reintentando tu acceso; conserva esta pantalla abierta.",
      code: "DATABASE_BUSY",
    },
    {
      status: 503,
      headers: {
        ...NO_STORE_HEADERS,
        "retry-after": "2",
      },
    },
  );
}

function databaseErrorDetail(error: unknown) {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : null;
  return {
    message: error instanceof Error ? error.message : String(error),
    cause:
      cause instanceof Error
        ? cause.message
        : cause == null
          ? null
          : String(cause),
  };
}

function lockedResponse() {
  return Response.json(
    {
      error: "Demasiados intentos. Espera 15 minutos para volver a ingresar.",
      code: "IDENTITY_LOCKED",
    },
    { status: 429, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  let worker: Awaited<ReturnType<typeof getWorkerSession>>;
  try {
    worker = await getWorkerSession(request);
  } catch (error) {
    console.error("worker-session.restore-failed", databaseErrorDetail(error));
    return databaseBusyResponse();
  }
  if (!worker)
    return Response.json(
      { error: "Sesión no autorizada" },
      { status: 401, headers: NO_STORE_HEADERS },
    );

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("sntss_worker="))
    ?.slice(13);
  if (token) {
    try {
      await env.DB.prepare(
        "UPDATE worker_sessions SET expires_at=datetime('now','+400 days') WHERE token=?",
      )
        .bind(token)
        .run();
    } catch (error) {
      // La sesión ya fue validada. Una renovación diferida no debe bloquear
      // el acceso ni convertir una sesión válida en un error 500.
      console.warn("worker-session.renewal-delayed", databaseErrorDetail(error));
    }
  }

  return Response.json(
    {
      worker: {
        ...worker,
        canCoachProgress: canCoachProgressLists(worker.matricula),
      },
    },
    {
      headers: {
        ...NO_STORE_HEADERS,
        ...(token
          ? { "set-cookie": workerSessionCookie(token, PERSISTENT_SESSION_SECONDS, request) }
          : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  let body: {
    matricula?: string;
    password?: string;
    email?: string;
    curp?: string;
    method?: "password" | "email_curp";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La solicitud de acceso está vacía o incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const matricula = normalizeMatricula(body.matricula || "");
  if (matricula.length < 4)
    return Response.json(
      { error: "Escribe una matrícula válida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );

  const method =
    body.method || (body.email || body.curp ? "email_curp" : "password");

  if (method === "email_curp") {
    const email = normalizeAccessEmail(body.email || "");
    const curp = normalizeAccessCurp(body.curp || "");
    if (!validAccessEmail(email))
      return Response.json(
        { error: "Escribe el correo electrónico registrado." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    if (!validAccessCurp(curp))
      return Response.json(
        { error: "Escribe una CURP válida de 18 caracteres." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    try {
      if (await identityAccessLocked(matricula)) return lockedResponse();
      const worker = await findWorkerForAuthentication(matricula);
      if (!worker) {
        if (await noteIdentityFailure(matricula, "email_curp"))
          return lockedResponse();
        return Response.json(
          {
            error: "La matrícula, el correo o la CURP no coinciden.",
            code: "IDENTITY_MISMATCH",
          },
          { status: 401, headers: NO_STORE_HEADERS },
        );
      }
      if (!worker.identityCurp || (!worker.email?.trim() && !worker.adminValidated)) {
        return Response.json(
          {
            error:
              "Tu perfil aún no tiene correo y CURP confirmados. Vuelve al inicio y selecciona Registrar para enviar tu CURP, tarjetón e INE a revisión.",
            code: "IDENTITY_NOT_READY",
          },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      }
      const matches = identityDetailsMatch({
        suppliedEmail: email,
        suppliedCurp: curp,
        storedEmail: worker.email || email,
        storedCurp: worker.identityCurp,
      });
      if (!matches.curpMatches || (worker.email?.trim() && !matches.emailMatches)) {
        if (await noteIdentityFailure(matricula, "email_curp"))
          return lockedResponse();
        return Response.json(
          {
            error: "La matrícula, el correo o la CURP no coinciden.",
            code: "IDENTITY_MISMATCH",
          },
          { status: 401, headers: NO_STORE_HEADERS },
        );
      }
      if (!worker.email?.trim() && worker.adminValidated)
        await bindWorkerEmailIfMissing(worker, email);
      await resetIdentityFailures(matricula);
      const session = await createWorkerSession(worker);
      await audit(
        `matricula:${matricula}`,
        "worker.identity_session_started",
        "worker",
        worker.id,
        "email_curp",
      );
      const headers = new Headers({
          "content-type": "application/json",
          ...NO_STORE_HEADERS,
      });
      appendWorkerLoginCookies(headers, session.token, request);
      return new Response(JSON.stringify({ worker: session.worker }), {
        headers,
      });
    } catch (error) {
      console.error(
        "worker-session.identity-failed",
        databaseErrorDetail(error),
      );
      return databaseBusyResponse();
    }
  }

  const password = body.password || "";
  let worker;
  try {
    worker = await findWorkerForAuthentication(matricula);
  } catch (error) {
    console.error("worker-session.lookup-failed", databaseErrorDetail(error));
    return databaseBusyResponse();
  }
  if (!worker)
    return Response.json(
      { error: "Matrícula o contraseña incorrectas." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  if (!worker.passwordHash || !worker.passwordSalt)
    return Response.json(
      {
        error:
          "El acceso únicamente con matrícula ya no está disponible. Usa Google o confirma tu correo y CURP.",
        code: "STRONG_AUTH_REQUIRED",
      },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  if (worker.passwordLocked) return lockedResponse();
  if (!password)
    return Response.json(
      {
        error: "Escribe tu contraseña personal para continuar.",
        code: "PASSWORD_REQUIRED",
      },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  const candidateHash = await derivePasswordHash(
    password,
    worker.passwordSalt,
    worker.iterations || PASSWORD_ITERATIONS,
  );
  if (!constantTimeEqual(candidateHash, worker.passwordHash)) {
    try {
      await env.DB.prepare(
        `UPDATE worker_passwords SET failed_attempts=failed_attempts+1,
          locked_until=CASE WHEN failed_attempts+1>=5
            THEN datetime('now','+15 minutes') ELSE locked_until END
         WHERE matricula=?`,
      )
        .bind(matricula)
        .run();
    } catch (error) {
      console.error(
        "worker-session.failed-attempt-not-recorded",
        databaseErrorDetail(error),
      );
      return databaseBusyResponse();
    }
    return Response.json(
      { error: "Matrícula o contraseña incorrectas." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  try {
    await env.DB.prepare(
      "UPDATE worker_passwords SET failed_attempts=0,locked_until=NULL WHERE matricula=?",
    )
      .bind(matricula)
      .run();
  } catch (error) {
    console.warn(
      "worker-session.attempt-reset-delayed",
      databaseErrorDetail(error),
    );
  }
  try {
    const session = await createWorkerSession(worker);
    await audit(
      `matricula:${matricula}`,
      "worker.password_session_started",
      "worker",
      worker.id,
    );
    const headers = new Headers({
        "content-type": "application/json",
        ...NO_STORE_HEADERS,
    });
    appendWorkerLoginCookies(headers, session.token, request);
    return new Response(JSON.stringify({ worker: session.worker }), {
      headers,
    });
  } catch (error) {
    console.error("worker-session.create-failed", databaseErrorDetail(error));
    return databaseBusyResponse();
  }
}

export async function DELETE(request: Request) {
  const tokens = (request.headers.get("cookie") || "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("sntss_worker="))
    .map((item) => item.slice(13))
    .filter(Boolean)
    .slice(0, 4);
  if (tokens.length) {
    try {
      await env.DB.batch(
        tokens.map((token) =>
          env.DB.prepare("DELETE FROM worker_sessions WHERE token=?").bind(token),
        ),
      );
    } catch (error) {
      // La cookie se elimina aunque D1 esté ocupado; así el dispositivo queda
      // cerrado y el registro vencido se depura posteriormente.
      console.warn("worker-session.delete-delayed", error);
    }
  }
  const headers = new Headers(NO_STORE_HEADERS);
  for (const cookie of expiredWorkerSessionCookies(request))
    headers.append("set-cookie", cookie);
  for (const cookie of workerLogoutCookieVariants("1", PERSISTENT_SESSION_SECONDS, request))
    headers.append("set-cookie", cookie);
  return new Response(null, {
    status: 204,
    headers,
  });
}
