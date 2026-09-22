import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import { ensureInitialClause97Data } from "../../../devi/clause97-initial-data";
import { normalizeProgressName } from "../../../devi/progress-lists";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type Clause97EntryRow = {
  id: number;
  listId: number;
  processType: string;
  listTitle: string;
  referenceLabel: string | null;
  matricula: string;
  fullName: string | null;
  unitText: string | null;
  statusText: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  sheetName: string;
  rowNumber: number;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const ENTRY_SELECT = `SELECT e.id,e.list_id AS listId,l.process_type AS processType,
  l.title AS listTitle,l.reference_label AS referenceLabel,e.matricula,
  e.full_name AS fullName,e.unit_text AS unitText,e.status_text AS statusText,
  e.status_updated_at AS statusUpdatedAt,e.status_updated_by AS statusUpdatedBy,
  e.sheet_name AS sheetName,e.row_number AS rowNumber
 FROM devi_progress_entries e
 JOIN devi_progress_lists l ON l.id=e.list_id
 WHERE l.active=1
   AND l.process_type IN ('clausula_97','dispensa_clausula_97')`;

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "acts");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  await ensureInitialClause97Data();
  const matricula = cleanText(
    new URL(request.url).searchParams.get("matricula"),
    12,
  ).replace(/\D/g, "");
  if (!/^\d{4,12}$/.test(matricula))
    return Response.json(
      { error: "Escribe una matrícula válida de 4 a 12 dígitos." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const result = await env.DB.prepare(
    `${ENTRY_SELECT} AND e.matricula=? ORDER BY l.updated_at DESC,e.row_number ASC LIMIT 100`,
  )
    .bind(matricula)
    .all<Clause97EntryRow>();
  await audit(
    privilege.actor,
    "devi.clause97-matricula-viewed",
    "worker",
    matricula,
    JSON.stringify({ matches: result.results.length }),
  ).catch((error) => console.error("devi.clause97-view-audit-failed", error));
  return Response.json({ entries: result.results }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "acts");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal del perfil protegido." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: {
    id?: number;
    fullName?: string;
    unitText?: string;
    statusText?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Solicitud inválida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const id = Number(body.id || 0);
  const fullName = cleanText(body.fullName, 180);
  const unitText = cleanText(body.unitText, 160);
  const statusText = cleanText(body.statusText, 240);
  if (!Number.isInteger(id) || id < 1)
    return Response.json(
      { error: "Registro inválido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (fullName.length < 3 || statusText.length < 2)
    return Response.json(
      { error: "Captura un nombre y un estatus válidos." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const previous = await env.DB.prepare(`${ENTRY_SELECT} AND e.id=? LIMIT 1`)
    .bind(id)
    .first<Clause97EntryRow>();
  if (!previous)
    return Response.json(
      { error: "El registro ya no está activo o no pertenece a Cláusula 97." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE devi_progress_entries
     SET full_name=?,normalized_name=?,unit_text=?,status_text=?,status_updated_at=?,status_updated_by=?
     WHERE id=?`,
  )
    .bind(
      fullName,
      normalizeProgressName(fullName),
      unitText || null,
      statusText,
      updatedAt,
      privilege.actor,
      id,
    )
    .run();
  await audit(
    privilege.actor,
    "devi.clause97-entry-updated",
    "devi_progress_entry",
    id,
    JSON.stringify({
      matricula: previous.matricula,
      before: {
        fullName: previous.fullName,
        unitText: previous.unitText,
        statusText: previous.statusText,
      },
      after: { fullName, unitText: unitText || null, statusText },
    }),
  ).catch((error) => console.error("devi.clause97-update-audit-failed", error));
  const updated = await env.DB.prepare(`${ENTRY_SELECT} AND e.id=? LIMIT 1`)
    .bind(id)
    .first<Clause97EntryRow>();
  return Response.json(
    {
      ok: true,
      entry: updated,
      message:
        "Nombre, adscripción y estatus actualizados. DeVi ya usa esta información.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
