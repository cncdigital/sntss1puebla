import { env } from "cloudflare:workers";
import { getCredentialValidity } from "../credential-validity";
import { normalizeCredentialToken } from "../../credential-token";
import { ensureEventSchema, normalizeEventCategory } from "./schema";

export class EventAccessError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type EventCredential = {
  applicationId: number;
  credentialToken: string;
  kind: "Titular" | "Beneficiario";
  fullName: string;
  matricula: string;
  category: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
};

export type EventRecord = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
};

export async function validateEventCredential(eventId: number, rawToken: string) {
  await ensureEventSchema();
  const event = await env.DB.prepare(
    `SELECT id,name,event_date AS eventDate,location
     FROM events WHERE id=? AND active=1`,
  )
    .bind(eventId)
    .first<EventRecord>();
  if (!event)
    throw new EventAccessError("El evento no existe o ya no está activo.", 404);

  const token = normalizeCredentialToken(rawToken);
  if (!token)
    throw new EventAccessError("Escanea o captura el código de la credencial.", 400);

  const credential = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.credential_token AS credentialToken,
      'Titular' AS kind,w.full_name AS fullName,w.matricula,w.category,
      COALESCE(a.curp,w.curp) AS curp,wt.rfc,w.nss
     FROM applications a
     JOIN workers w ON w.id=a.worker_id
     LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
     WHERE a.credential_token=? AND a.status='approved' AND a.archived_at IS NULL
     UNION ALL
     SELECT a.id AS applicationId,b.credential_token AS credentialToken,
      'Beneficiario' AS kind,b.full_name AS fullName,w.matricula,w.category,
      b.curp,wt.rfc,w.nss
     FROM beneficiaries b
     JOIN applications a ON a.id=b.application_id
     JOIN workers w ON w.id=a.worker_id
     LEFT JOIN worker_tax_ids wt ON wt.matricula=w.matricula
     WHERE b.credential_token=? AND b.active=1 AND a.status='approved' AND a.archived_at IS NULL
     LIMIT 1`,
  )
    .bind(token, token)
    .first<EventCredential>();
  if (!credential)
    throw new EventAccessError("Credencial no válida, inactiva o inexistente.", 404);
  if (credential.kind !== "Titular")
    throw new EventAccessError(
      "Este evento requiere la credencial del titular para validar su categoría laboral.",
      403,
      { kind: credential.kind },
    );

  const validity = await getCredentialValidity(credential.applicationId);
  if (!validity.valid)
    throw new EventAccessError(`CREDENCIAL NO VÁLIDA: ${validity.reason}`, 403);

  const category = credential.category?.trim() || "";
  if (!category)
    throw new EventAccessError(
      "La credencial no tiene una categoría registrada. Administración debe actualizar el padrón.",
      403,
      { matricula: credential.matricula },
    );
  const allowed = await env.DB.prepare(
    `SELECT category FROM event_categories
     WHERE event_id=? ORDER BY category`,
  )
    .bind(eventId)
    .all<{ category: string }>();
  const normalized = normalizeEventCategory(category);
  const categoryAllowed = allowed.results.some(
    (item) => normalizeEventCategory(item.category) === normalized,
  );
  if (!categoryAllowed)
    throw new EventAccessError(
      `ACCESO DENEGADO: la categoría “${category}” no está autorizada para este evento.`,
      403,
      { category, allowedCategories: allowed.results.map((item) => item.category) },
    );

  return {
    event,
    credential: { ...credential, category },
  };
}

export function eventAccessErrorResponse(error: unknown) {
  if (error instanceof EventAccessError)
    return Response.json(
      { error: error.message, ...error.details },
      { status: error.status },
    );
  return Response.json(
    { error: "No fue posible validar la credencial para el evento." },
    { status: 500 },
  );
}
