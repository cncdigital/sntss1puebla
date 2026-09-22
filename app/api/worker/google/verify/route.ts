import { env } from "cloudflare:workers";
import {
  identityDetailsMatch,
  matriculaFromGoogleActor,
  normalizeAccessCurp,
  normalizeAccessEmail,
  validAccessCurp,
} from "../../../../worker-identity";
import {
  bindWorkerEmailIfMissing,
  appendWorkerLoginCookies,
  createWorkerSession,
  findWorkerForAuthentication,
  googleStateCookie,
  identityAccessLocked,
  markGoogleIdentity,
  NO_STORE_HEADERS,
  noteIdentityFailure,
  requestCookie,
  resetIdentityFailures,
} from "../../identity-auth";

export async function POST(request: Request) {
  let body: { curp?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La solicitud de verificación está incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const curp = normalizeAccessCurp(body.curp || "");
  if (!validAccessCurp(curp))
    return Response.json(
      { error: "Escribe una CURP válida de 18 caracteres." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const state = requestCookie(request, "sntss_worker_auth_state");
  if (!state)
    return Response.json(
      {
        error: "La verificación con Google venció. Iníciala nuevamente.",
        code: "GOOGLE_STATE_EXPIRED",
      },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  try {
    const saved = await env.DB.prepare(
      `SELECT actor,redirect_uri AS googleEmail
       FROM google_drive_oauth_states
       WHERE state=? AND expires_at>CURRENT_TIMESTAMP`,
    )
      .bind(state)
      .first<{ actor: string; googleEmail: string }>();
    const matricula = saved
      ? matriculaFromGoogleActor(saved.actor, true)
      : null;
    const googleEmail = normalizeAccessEmail(saved?.googleEmail || "");
    if (!matricula || !googleEmail)
      return Response.json(
        {
          error: "La verificación con Google venció. Iníciala nuevamente.",
          code: "GOOGLE_STATE_EXPIRED",
        },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    if (await identityAccessLocked(matricula))
      return Response.json(
        {
          error: "Demasiados intentos. Espera 15 minutos para volver a ingresar.",
          code: "IDENTITY_LOCKED",
        },
        { status: 429, headers: NO_STORE_HEADERS },
      );
    const worker = await findWorkerForAuthentication(matricula);
    if (!worker || !worker.identityCurp) {
      await env.DB.prepare(
        "DELETE FROM google_drive_oauth_states WHERE state=?",
      )
        .bind(state)
        .run();
      return Response.json(
        {
          error:
            "Tu perfil no tiene una CURP confirmada. Vuelve al inicio y selecciona Registrar para enviar tus documentos a revisión.",
          code: "IDENTITY_NOT_READY",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    const matches = identityDetailsMatch({
      suppliedEmail: googleEmail,
      suppliedCurp: curp,
      storedEmail: worker.email,
      storedCurp: worker.identityCurp,
    });
    if (!matches.emailMatches || !matches.curpMatches) {
      const locked = await noteIdentityFailure(matricula, "google");
      return Response.json(
        {
          error: locked
            ? "Demasiados intentos. Espera 15 minutos para volver a ingresar."
            : "La CURP no coincide con el perfil de la matrícula.",
          code: locked ? "IDENTITY_LOCKED" : "IDENTITY_MISMATCH",
        },
        { status: locked ? 429 : 401, headers: NO_STORE_HEADERS },
      );
    }
    await env.DB.prepare(
      "DELETE FROM google_drive_oauth_states WHERE state=?",
    )
      .bind(state)
      .run();
    await bindWorkerEmailIfMissing(worker, googleEmail);
    await resetIdentityFailures(matricula);
    await markGoogleIdentity(worker, googleEmail, googleEmail);
    const session = await createWorkerSession(worker);
    const headers = new Headers({
      "content-type": "application/json",
      ...NO_STORE_HEADERS,
    });
    appendWorkerLoginCookies(headers, session.token, request);
    headers.append("set-cookie", googleStateCookie("", 0, request));
    return new Response(JSON.stringify({ worker: session.worker }), {
      headers,
    });
  } catch (error) {
    console.error("worker-google.verify-failed", error);
    return Response.json(
      { error: "No fue posible completar la verificación con Google." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
