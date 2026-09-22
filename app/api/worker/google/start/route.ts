import { env } from "cloudflare:workers";
import { audit } from "../../../authz";
import {
  googleAccessActor,
  normalizeMatricula,
} from "../../../../worker-identity";
import {
  findWorkerForAuthentication,
  googleStateCookie,
  identityAccessLocked,
  NO_STORE_HEADERS,
  noteIdentityFailure,
} from "../../identity-auth";

function randomState() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function POST(request: Request) {
  let body: { matricula?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La solicitud de acceso está incompleta." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const matricula = normalizeMatricula(body.matricula || "");
  if (matricula.length < 4)
    return Response.json(
      { error: "Escribe una matrícula válida antes de continuar con Google." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  try {
    if (await identityAccessLocked(matricula))
      return Response.json(
        {
          error: "Demasiados intentos. Espera 15 minutos para volver a ingresar.",
          code: "IDENTITY_LOCKED",
        },
        { status: 429, headers: NO_STORE_HEADERS },
      );
    const worker = await findWorkerForAuthentication(matricula);
    if (!worker) {
      const locked = await noteIdentityFailure(matricula, "google");
      return Response.json(
        {
          error: locked
            ? "Demasiados intentos. Espera 15 minutos para volver a ingresar."
            : "No fue posible comprobar el acceso con los datos proporcionados.",
          code: locked ? "IDENTITY_LOCKED" : "IDENTITY_MISMATCH",
        },
        { status: locked ? 429 : 401, headers: NO_STORE_HEADERS },
      );
    }
    const state = randomState();
    const returnTo = `/api/worker/google/callback?state=${encodeURIComponent(state)}`;
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM google_drive_oauth_states WHERE expires_at<=CURRENT_TIMESTAMP",
      ),
      env.DB.prepare(
        `INSERT INTO google_drive_oauth_states
          (state,actor,redirect_uri,expires_at)
         VALUES (?,?,?,datetime('now','+10 minutes'))`,
      ).bind(state, googleAccessActor(matricula), returnTo),
    ]);
    await audit(
      `matricula:${matricula}`,
      "worker.google_signin_started",
      "worker",
      worker.id,
    );
    return Response.json(
      {
        signInPath: `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`,
      },
      {
        headers: {
          ...NO_STORE_HEADERS,
          "set-cookie": googleStateCookie(state, 600, request),
        },
      },
    );
  } catch (error) {
    console.error("worker-google.start-failed", error);
    return Response.json(
      {
        error:
          "No fue posible iniciar la verificación con Google. Intenta nuevamente.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
