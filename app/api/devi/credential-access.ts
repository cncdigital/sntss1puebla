import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../authz";
import { getCredentialValidity } from "../credential-validity";
import { resolveRequestedMatricula } from "../../devi/credential-request";

export type DeviCredentialAccess = {
  authenticated: boolean;
  valid: boolean;
  matricula: string | null;
  reason: string;
};

export async function getDeviCredentialAccess(
  request: Request,
): Promise<DeviCredentialAccess> {
  const [worker, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  const available = Array.from(
    new Set([worker?.matricula, privilege?.matricula].filter(Boolean)),
  ) as string[];
  if (!available.length)
    return {
      authenticated: false,
      valid: false,
      matricula: null,
      reason: "Sesión no autorizada.",
    };

  const resolution = resolveRequestedMatricula(request, available);
  if (!resolution.authorized)
    return {
      authenticated: true,
      valid: false,
      matricula: null,
      reason: resolution.reason,
    };
  const matricula = resolution.matricula;
  const application = await env.DB.prepare(
    `SELECT a.id FROM applications a
     JOIN workers w ON w.id=a.worker_id
     WHERE w.matricula=? AND w.active=1 AND a.archived_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(matricula)
    .first<{ id: number }>();
  if (!application)
    return {
      authenticated: true,
      valid: false,
      matricula,
      reason: "Todavía no existe una credencial validada para esta matrícula.",
    };
  const validity = await getCredentialValidity(application.id);
  return {
    authenticated: true,
    valid: validity.valid,
    matricula,
    reason: validity.reason,
  };
}

export function deviCredentialRequiredResponse(access: DeviCredentialAccess) {
  return Response.json(
    {
      error: access.authenticated
        ? "DeVi está disponible únicamente cuando tu credencial está válida."
        : "Sesión no autorizada",
      code: access.authenticated
        ? "DEVI_CREDENTIAL_REQUIRED"
        : "DEVI_SESSION_REQUIRED",
      reason: access.reason,
    },
    {
      status: access.authenticated ? 403 : 401,
      headers: { "cache-control": "private, no-store, max-age=0" },
    },
  );
}
