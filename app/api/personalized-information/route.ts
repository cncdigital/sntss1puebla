import { env } from "cloudflare:workers";
import { getWorkerSession } from "../authz";
import { getCredentialValidity } from "../credential-validity";
import { ensureInitialClause97Data } from "../../devi/clause97-initial-data";
import { progressProcessLabel, type ProgressProcessType } from "../../devi/progress-list-types";
import { progressShiftKind, progressNamesMatch } from "../../devi/progress-lists";
import { hydrateProgressPositions, type PositionableProgressEntry } from "../devi/progress-positions";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type PersonalEntry = PositionableProgressEntry & {
  processType: string;
  customProcessLabel: string | null;
  title: string;
  referenceLabel: string | null;
  updatedAt: string;
  statusText: string | null;
  statusUpdatedAt: string | null;
  fullName: string | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
};

function shiftLabel(value: string | null) {
  const kind = progressShiftKind(value);
  const labels: Record<string, string> = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    nocturno: "Nocturno",
    movil: "Móvil",
    jornada_acumulada: "Jornada acumulada",
  };
  return (kind && labels[kind]) || value || null;
}

function assignmentLabel(value: string | null) {
  const labels: Record<string, string> = {
    "22EA010000": "ESP",
    "22EB010000": "HTO",
    "22UA010000": "UMF 01",
    "22UA020000": "UMF 02",
  };
  return value ? labels[value] || value : null;
}

function processLabel(entry: PersonalEntry) {
  return progressProcessLabel(entry.processType as ProgressProcessType, entry.customProcessLabel);
}

function readableDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(date);
}

export async function GET(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Sesión de trabajador requerida." }, { status: 401, headers: NO_STORE_HEADERS });

  await ensureInitialClause97Data();
  const application = await env.DB.prepare(
    `SELECT a.id,a.folio,a.status,a.document_status AS documentStatus
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE w.matricula=? AND w.active=1 AND a.archived_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
  ).bind(session.matricula).first<{ id: number; folio: string; status: string; documentStatus: string }>();

  const [entriesResult, scholarshipsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT e.id,e.list_id AS listId,e.matricula,e.movement_code AS movementCode,
        e.category_code AS categoryCode,e.category_name AS categoryName,
        e.requested_assignment_code AS requestedAssignmentCode,e.requested_shift AS requestedShift,
        e.calculated_position AS calculatedPosition,e.status_text AS statusText,
        e.status_updated_at AS statusUpdatedAt,e.full_name AS fullName,e.normalized_name AS normalizedName,
        l.process_type AS processType,l.custom_process_label AS customProcessLabel,l.title,
        l.reference_label AS referenceLabel,l.updated_at AS updatedAt
       FROM devi_progress_entries e JOIN devi_progress_lists l ON l.id=e.list_id
       WHERE e.matricula=? AND l.active=1
       ORDER BY l.updated_at DESC,e.row_number ASC LIMIT 500`,
    ).bind(session.matricula).all<PersonalEntry & { normalizedName: string | null }>(),
    env.DB.prepare(
      `SELECT e.folio,e.level,e.child_name AS childName,c.name AS campaignName,c.year
       FROM scholarship_entries e JOIN scholarship_campaigns c ON c.id=e.campaign_id
       WHERE e.matricula=? AND e.deleted_at IS NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 20`,
    ).bind(session.matricula).all<{ folio: string; level: string; childName: string; campaignName: string; year: number }>(),
  ]);

  const entries = entriesResult.results.filter((entry) =>
    progressNamesMatch(session.fullName, entry.normalizedName || entry.fullName || ""),
  );
  await hydrateProgressPositions(entries);

  const credential = application ? await getCredentialValidity(application.id) : null;
  const listItems = entries.map((entry) => ({
    id: entry.id,
    label: processLabel(entry),
    place: entry.calculatedPosition && entry.calculatedPosition > 0 ? entry.calculatedPosition : null,
    status: entry.statusText || null,
    reference: entry.referenceLabel || readableDate(entry.updatedAt),
    assignment: assignmentLabel(entry.requestedAssignmentCode),
    shift: shiftLabel(entry.requestedShift),
    category: entry.categoryName || entry.categoryCode || null,
  }));

  return Response.json({
    worker: {
      matricula: session.matricula,
      fullName: session.fullName,
      unit: session.unit,
      category: session.category,
    },
    credential: application
      ? { valid: Boolean(credential?.valid), reason: credential?.reason || "", folio: application.folio, status: application.status, documentStatus: application.documentStatus }
      : null,
    lists: listItems,
    scholarships: scholarshipsResult.results,
    updatedAt: new Date().toISOString(),
  }, { headers: NO_STORE_HEADERS });
}
