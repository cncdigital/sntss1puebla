import { env } from "cloudflare:workers";
import { forwardedIdentity } from "../../../authz";
import {
  constantTimeTextEqual,
  matriculaFromGoogleActor,
  normalizeAccessEmail,
  pendingGoogleAccessActor,
} from "../../../../worker-identity";
import {
  createWorkerSession,
  appendWorkerLoginCookies,
  findWorkerForAuthentication,
  googleStateCookie,
  markGoogleIdentity,
  NO_STORE_HEADERS,
  noteIdentityFailure,
  requestCookie,
  resetIdentityFailures,
} from "../../identity-auth";

function randomState() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function redirectHome(
  request: Request,
  auth: "google_success" | "google_verify" | "google_error",
  options: {
    code?: string;
    matricula?: string;
    sessionToken?: string;
    stateToken?: string;
  } = {},
) {
  const target = new URL("/", request.url);
  target.searchParams.set("auth", auth);
  if (options.code) target.searchParams.set("code", options.code);
  if (options.matricula)
    target.searchParams.set("matricula", options.matricula);
  const headers = new Headers({
    ...NO_STORE_HEADERS,
    location: target.toString(),
  });
  headers.append(
    "set-cookie",
    options.stateToken
      ? googleStateCookie(options.stateToken, 600, request)
      : googleStateCookie("", 0, request),
  );
  if (options.sessionToken)
    appendWorkerLoginCookies(headers, options.sessionToken, request);
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get("state")?.trim() || "";
  const cookieState = requestCookie(request, "sntss_worker_auth_state");
  if (
    !state ||
    !cookieState ||
    !constantTimeTextEqual(state, cookieState)
  )
    return redirectHome(request, "google_error", { code: "expired" });

  try {
    const saved = await env.DB.prepare(
      `SELECT actor,redirect_uri AS returnTo
       FROM google_drive_oauth_states
       WHERE state=? AND expires_at>CURRENT_TIMESTAMP`,
    )
      .bind(state)
      .first<{ actor: string; returnTo: string }>();
    await env.DB.prepare(
      "DELETE FROM google_drive_oauth_states WHERE state=?",
    )
      .bind(state)
      .run();
    const matricula = saved
      ? matriculaFromGoogleActor(saved.actor, false)
      : null;
    if (!matricula)
      return redirectHome(request, "google_error", { code: "expired" });

    const identity = forwardedIdentity(request);
    const googleEmail = normalizeAccessEmail(identity.email);
    if (!googleEmail)
      return redirectHome(request, "google_error", { code: "cancelled" });
    const worker = await findWorkerForAuthentication(matricula);
    if (!worker)
      return redirectHome(request, "google_error", { code: "mismatch" });

    const storedEmail = normalizeAccessEmail(worker.email || "");
    if (
      storedEmail &&
      !constantTimeTextEqual(storedEmail, googleEmail)
    ) {
      const locked = await noteIdentityFailure(matricula, "google");
      return redirectHome(request, "google_error", {
        code: locked ? "locked" : "email_mismatch",
      });
    }

    if (!storedEmail) {
      if (!worker.identityCurp)
        return redirectHome(request, "google_error", {
          code: "identity_not_ready",
        });
      const pendingState = randomState();
      await env.DB.prepare(
        `INSERT INTO google_drive_oauth_states
          (state,actor,redirect_uri,expires_at)
         VALUES (?,?,?,datetime('now','+10 minutes'))`,
      )
        .bind(
          pendingState,
          pendingGoogleAccessActor(matricula),
          googleEmail,
        )
        .run();
      return redirectHome(request, "google_verify", {
        matricula,
        stateToken: pendingState,
      });
    }

    await resetIdentityFailures(matricula);
    await markGoogleIdentity(
      worker,
      googleEmail,
      identity.name || googleEmail,
    );
    const session = await createWorkerSession(worker);
    return redirectHome(request, "google_success", {
      sessionToken: session.token,
    });
  } catch (error) {
    console.error("worker-google.callback-failed", error);
    return redirectHome(request, "google_error", { code: "unavailable" });
  }
}
