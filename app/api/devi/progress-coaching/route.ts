import { env } from "cloudflare:workers";
import { progressShiftKind } from "../../../devi/progress-lists";
import { progressProcessLabel } from "../../../devi/progress-list-types";
import { audit } from "../../authz";
import { getProgressCoachAccess } from "../progress-coach-access";
import { hydrateProgressPositions } from "../progress-positions";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type ProgressMatchRow = {
  id: number;
  entryId: number;
  listId: number;
  listTitle: string;
  processType: string;
  customProcessLabel: string | null;
  referenceLabel: string | null;
  matricula: string;
  movementCode: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
  calculatedPosition: number | null;
  sheetName: string;
  rowNumber: number;
  updatedAt: string;
};

type ProgressCoachingRow = {
  id: string;
  entryId: number;
  listId: number;
  listTitle: string;
  targetMatricula: string;
  processType: string;
  queueLabel: string;
  automaticPosition: number | null;
  suggestedPosition: number;
  searchRecommendation: string;
  importance: "alta" | "media" | "baja";
  referenceLabel: string | null;
  active: number;
  operational: number;
  createdAt: string;
  updatedAt: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMatricula(value: unknown) {
  const matricula = String(value ?? "").replace(/\D/g, "");
  return /^\d{4,12}$/.test(matricula) ? matricula : "";
}

function entryProcessType(row: ProgressMatchRow) {
  if (row.movementCode === "CAD") return "cambio_adscripcion";
  if (row.movementCode === "CAT") return "cambio_turno";
  return row.processType;
}

function shiftLabel(value: string | null) {
  const kind = progressShiftKind(value);
  const labels: Record<string, string> = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    nocturno: "Nocturno",
    jornada_acumulada: "Jornada Acumulada",
    movil: "Móvil",
  };
  return (kind && labels[kind]) || value || "sin identificar";
}

function queueLabel(row: ProgressMatchRow) {
  const parts: string[] = [];
  if (row.movementCode) parts.push(row.movementCode);
  if (row.requestedAssignmentCode)
    parts.push(`adscripción ${row.requestedAssignmentCode}`);
  if (row.categoryCode || row.categoryName)
    parts.push(
      `categoría ${[row.categoryCode, row.categoryName].filter(Boolean).join(" · ")}`,
    );
  if (row.requestedShift) parts.push(`turno ${shiftLabel(row.requestedShift)}`);
  parts.push(
    row.sheetName.startsWith("Página ")
      ? `${row.sheetName} · renglón ${row.rowNumber}`
      : `hoja ${row.sheetName} · fila ${row.rowNumber}`,
  );
  return parts.join(" · ");
}

function publicMatch(row: ProgressMatchRow) {
  const processType = entryProcessType(row);
  return {
    entryId: row.entryId,
    listId: row.listId,
    listTitle: row.listTitle,
    processType,
    processLabel: progressProcessLabel(processType, row.customProcessLabel),
    referenceLabel: row.referenceLabel,
    queueLabel: queueLabel(row),
    automaticPosition:
      Number.isInteger(row.calculatedPosition) && Number(row.calculatedPosition) > 0
        ? Number(row.calculatedPosition)
        : null,
    updatedAt: row.updatedAt,
  };
}

function deduplicateMatches(rows: ProgressMatchRow[]) {
  const matches = new Map<string, ProgressMatchRow>();
  for (const row of rows) {
    const key = [
      row.listId,
      row.movementCode || "LISTA",
      row.requestedAssignmentCode || "sin_adscripcion",
      row.categoryCode || row.categoryName || "sin_categoria",
      progressShiftKind(row.requestedShift) || "sin_turno",
    ].join("|");
    if (!matches.has(key)) matches.set(key, row);
  }
  return Array.from(matches.values());
}

function publicCoaching(row: ProgressCoachingRow) {
  return {
    ...row,
    active: Boolean(row.active),
    operational: Boolean(row.operational),
  };
}

async function recentCoaching() {
  return env.DB.prepare(
    `SELECT id,entry_id AS entryId,list_id AS listId,list_title AS listTitle,
      target_matricula AS targetMatricula,process_type AS processType,
      queue_label AS queueLabel,automatic_position AS automaticPosition,
      suggested_position AS suggestedPosition,
      search_recommendation AS searchRecommendation,importance,
      reference_label AS referenceLabel,active,
      CASE WHEN devi_progress_coaching.active=1 AND EXISTS (
        SELECT 1 FROM devi_progress_entries e
        JOIN devi_progress_lists l ON l.id=e.list_id
        WHERE e.id=devi_progress_coaching.entry_id AND l.active=1
      ) THEN 1 ELSE 0 END AS operational,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM devi_progress_coaching
     ORDER BY active DESC,
       CASE importance WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
       updated_at DESC LIMIT 200`,
  ).all<ProgressCoachingRow>();
}

export async function GET(request: Request) {
  const access = await getProgressCoachAccess(request);
  if (!access)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const targetMatricula = cleanMatricula(
    new URL(request.url).searchParams.get("matricula"),
  );
  if (new URL(request.url).searchParams.has("matricula") && !targetMatricula)
    return Response.json(
      { error: "Escribe una matrícula válida de 4 a 12 dígitos." },
      { status: 400, headers: NO_STORE_HEADERS },
    );

  const [coaching, matches] = await Promise.all([
    recentCoaching(),
    targetMatricula
      ? env.DB.prepare(
          `SELECT e.id,e.id AS entryId,e.list_id AS listId,l.title AS listTitle,
            l.process_type AS processType,l.custom_process_label AS customProcessLabel,
            l.reference_label AS referenceLabel,e.matricula,
            e.movement_code AS movementCode,e.category_code AS categoryCode,
            e.category_name AS categoryName,
            e.requested_assignment_code AS requestedAssignmentCode,
            e.requested_shift AS requestedShift,
            e.calculated_position AS calculatedPosition,
            e.sheet_name AS sheetName,e.row_number AS rowNumber,
            l.updated_at AS updatedAt
           FROM devi_progress_entries e
           JOIN devi_progress_lists l ON l.id=e.list_id
           WHERE e.matricula=? AND l.active=1
           ORDER BY l.updated_at DESC,e.progressive_order,e.row_number LIMIT 500`,
        )
          .bind(targetMatricula)
          .all<ProgressMatchRow>()
      : Promise.resolve({ results: [] as ProgressMatchRow[] }),
  ]);
  await hydrateProgressPositions(matches.results);
  return Response.json(
    {
      authorized: true,
      targetMatricula: targetMatricula || null,
      matches: deduplicateMatches(matches.results).map(publicMatch),
      coaching: coaching.results.map(publicCoaching),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const access = await getProgressCoachAccess(request);
  if (!access)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (access.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal de tu perfil protegido." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const targetMatricula = cleanMatricula(body.targetMatricula);
  const entryId = Number(body.entryId || 0);
  const suggestedPosition = Number(body.suggestedPosition || 0);
  const searchRecommendation = cleanText(body.searchRecommendation, 2_000);
  const importance = cleanText(body.importance, 10);
  const referenceLabel = cleanText(body.referenceLabel, 280) || null;
  if (body.confirmed !== true)
    return Response.json(
      { error: "Confirma que verificaste el lugar antes de entrenar a DeVi." },
      { status: 400 },
    );
  if (!targetMatricula || !Number.isInteger(entryId) || entryId < 1)
    return Response.json(
      { error: "Selecciona una coincidencia válida del listado." },
      { status: 400 },
    );
  if (
    !Number.isInteger(suggestedPosition) ||
    suggestedPosition < 1 ||
    suggestedPosition > 99_999
  )
    return Response.json(
      { error: "El lugar real debe ser un número entre 1 y 99,999." },
      { status: 400 },
    );
  if (searchRecommendation.length < 12)
    return Response.json(
      { error: "Explica en al menos 12 caracteres cómo localizar o verificar el lugar." },
      { status: 400 },
    );
  if (!new Set(["alta", "media", "baja"]).has(importance))
    return Response.json(
      { error: "Selecciona una importancia válida." },
      { status: 400 },
    );

  const entry = await env.DB.prepare(
    `SELECT e.id,e.id AS entryId,e.list_id AS listId,l.title AS listTitle,
      l.process_type AS processType,l.custom_process_label AS customProcessLabel,
      l.reference_label AS referenceLabel,e.matricula,
      e.movement_code AS movementCode,e.category_code AS categoryCode,
      e.category_name AS categoryName,
      e.requested_assignment_code AS requestedAssignmentCode,
      e.requested_shift AS requestedShift,e.calculated_position AS calculatedPosition,
      e.sheet_name AS sheetName,e.row_number AS rowNumber,l.updated_at AS updatedAt
     FROM devi_progress_entries e
     JOIN devi_progress_lists l ON l.id=e.list_id
     WHERE e.id=? AND e.matricula=? AND l.active=1 LIMIT 1`,
  )
    .bind(entryId, targetMatricula)
    .first<ProgressMatchRow>();
  if (!entry)
    return Response.json(
      { error: "La coincidencia ya no pertenece a un listado activo. Busca de nuevo la matrícula." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  await hydrateProgressPositions([entry]);

  const id = crypto.randomUUID();
  const processType = entryProcessType(entry);
  const resolvedQueueLabel = queueLabel(entry);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE devi_progress_coaching SET active=0,updated_at=CURRENT_TIMESTAMP
       WHERE entry_id=? AND active=1`,
    ).bind(entry.entryId),
    env.DB.prepare(
      `INSERT INTO devi_progress_coaching
        (id,entry_id,list_id,list_title,target_matricula,process_type,queue_label,
         automatic_position,suggested_position,search_recommendation,importance,
         reference_label,created_by,active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    ).bind(
      id,
      entry.entryId,
      entry.listId,
      entry.listTitle,
      targetMatricula,
      processType,
      resolvedQueueLabel,
      entry.calculatedPosition,
      suggestedPosition,
      searchRecommendation,
      importance,
      referenceLabel,
      access.actor,
    ),
  ]);
  await audit(
    access.actor,
    "devi.progress-coaching-added",
    "devi_progress_coaching",
    id,
    JSON.stringify({
      targetMatricula,
      entryId: entry.entryId,
      listId: entry.listId,
      automaticPosition: entry.calculatedPosition,
      suggestedPosition,
      importance,
    }),
  );
  return Response.json(
    {
      ok: true,
      id,
      message:
        "Entrenamiento guardado. DeVi mostrará el lugar validado, la recomendación y el conteo automático como referencia.",
    },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const access = await getProgressCoachAccess(request);
  if (!access)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (access.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal de tu perfil protegido." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const id = cleanText(body.id, 80);
  const current = await env.DB.prepare(
    `SELECT target_matricula AS targetMatricula,entry_id AS entryId
     FROM devi_progress_coaching WHERE id=? AND active=1 LIMIT 1`,
  )
    .bind(id)
    .first<{ targetMatricula: string; entryId: number }>();
  if (!current)
    return Response.json(
      { error: "El entrenamiento ya no está activo." },
      { status: 404 },
    );
  await env.DB.prepare(
    `UPDATE devi_progress_coaching SET active=0,updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
  )
    .bind(id)
    .run();
  await audit(
    access.actor,
    "devi.progress-coaching-deactivated",
    "devi_progress_coaching",
    id,
    JSON.stringify(current),
  );
  return Response.json(
    {
      ok: true,
      message: "Entrenamiento desactivado; DeVi volvió a usar el conteo automático del listado.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
