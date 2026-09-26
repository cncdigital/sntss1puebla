import { env } from "cloudflare:workers";
import { requirePrivilege } from "../../authz";
import { isMasterAdministrator } from "../../../master-admin";
import {
  expiredWorkerSessionCookies,
  NO_STORE_HEADERS,
  PERSISTENT_SESSION_SECONDS,
  sharedPortalCookieDomain,
  workerLogoutCookieVariants,
} from "../../worker/identity-auth";

export async function POST(request: Request) {
  const manager = await requirePrivilege(request, "admin");
  if (!manager || !isMasterAdministrator(manager.matricula))
    return Response.json({ error: "Acceso exclusivo para Administración Total." }, { status: 403, headers: NO_STORE_HEADERS });

  let confirmation = "";
  try {
    confirmation = ((await request.json()) as { confirmation?: string }).confirmation || "";
  } catch { /* Se exige una confirmación explícita. */ }
  if (confirmation !== "CERRAR TODAS")
    return Response.json({ error: "Confirma el cierre de todas las sesiones." }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    // D1 ejecuta el lote como una transacción: ninguna sesión queda a medias.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM worker_sessions"),
      env.DB.prepare("DELETE FROM privileged_sessions"),
      env.DB.prepare("DELETE FROM reader_sessions"),
      env.DB.prepare(
        "INSERT INTO audit_logs (actor,action,target_type,target_id,detail) VALUES (?,?,?,?,?)",
      ).bind(manager.actor, "sessions.revoked_all", "sessions", null, "Revocación total de sesiones activas"),
    ]);
  } catch (error) {
    console.error("admin.sessions.revoke-failed", error);
    return Response.json({ error: "No se pudieron cerrar las sesiones. Intenta de nuevo." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const headers = new Headers(NO_STORE_HEADERS);
  for (const cookie of expiredWorkerSessionCookies(request)) headers.append("set-cookie", cookie);
  for (const cookie of workerLogoutCookieVariants("1", PERSISTENT_SESSION_SECONDS, request)) headers.append("set-cookie", cookie);
  const domains = [sharedPortalCookieDomain(request), ""].filter((domain, index, all) => all.indexOf(domain) === index);
  for (const domain of domains) {
    headers.append("set-cookie", `sntss_privileged=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0${domain}`);
    headers.append("set-cookie", `sntss_privileged_logged_out=1; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${PERSISTENT_SESSION_SECONDS}${domain}`);
    headers.append("set-cookie", `sntss_reader=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0${domain}`);
  }
  return Response.json({ closed: true }, { headers });
}
