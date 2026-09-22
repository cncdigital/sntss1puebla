import { env } from "cloudflare:workers";
import type { HybridDeviReply } from "../../devi/ai";
import type { DeviSource } from "../../devi/knowledge";
import {
  detectProgressLookupIntent,
  progressShiftKind,
  progressNamesMatch,
} from "../../devi/progress-lists";
import { canConsultOtherProgressMatriculas } from "../../devi/progress-access";
import { progressProcessLabel } from "../../devi/progress-list-types";
import type { ProgressProcessType } from "../../devi/progress-list-types";
import { audit, getPrivilege } from "../authz";
import { hydrateProgressPositions } from "./progress-positions";
import { ensureInitialClause97Data } from "../../devi/clause97-initial-data";

type ProgressEntryRow = {
  id: number;
  listId: number;
  progressiveNumber: string;
  progressiveOrder: number;
  progressiveDerived: number;
  matricula: string;
  fullName: string | null;
  normalizedName: string;
  unitText: string | null;
  statusText: string | null;
  statusUpdatedAt: string | null;
  movementCode: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
  calculatedPosition: number | null;
  sheetName: string;
  rowNumber: number;
  title: string;
  processType: string;
  customProcessLabel: string | null;
  referenceLabel: string | null;
  originalName: string;
  updatedAt: string;
};

type ActiveListRow = {
  id: number;
  processType: string;
};

type ProgressCoachingRow = {
  id: string;
  entryId: number;
  suggestedPosition: number;
  searchRecommendation: string;
  importance: "alta" | "media" | "baja";
  referenceLabel: string | null;
  updatedAt: string;
};

function localReply(answer: string, sources: DeviSource[] = []): HybridDeviReply {
  return {
    mode: "knowledge",
    answer,
    sources,
    engine: "local",
  };
}

function readableDate(value: string) {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeZone: "America/Mexico_City",
      }).format(date);
}

function entryLocation(row: ProgressEntryRow) {
  return row.sheetName.startsWith("Página ")
    ? `${row.sheetName} · renglón ${row.rowNumber}`
    : `Hoja ${row.sheetName} · fila ${row.rowNumber}`;
}

const CAD_DESTINATION_LABELS: Record<string, string> = {
  "22EA010000": "ESP",
  "22EB010000": "HTO",
  "22UA010000": "UMF 01",
  "22UA020000": "UMF 02",
};

function cadDestination(row: ProgressEntryRow) {
  const code = row.requestedAssignmentCode || "adscripción sin clave";
  const shortLabel = CAD_DESTINATION_LABELS[code];
  return shortLabel ? `${shortLabel} (${code})` : code;
}

function cadCategory(row: ProgressEntryRow) {
  if (row.categoryCode && row.categoryName)
    return `${row.categoryCode} · ${row.categoryName}`;
  return row.categoryCode || row.categoryName || "categoría del listado";
}

function requestedShiftLabel(value: string | null) {
  const normalized = progressShiftKind(value);
  const labels: Record<string, string> = {
    matutino: "Matutino",
    vespertino: "Vespertino",
    nocturno: "Nocturno",
    movil: "Móvil",
    jornada_acumulada: "Jornada Acumulada",
  };
  return (normalized && labels[normalized]) || value || "turno sin identificar";
}

function hasCalculatedListPosition(row: ProgressEntryRow) {
  if (!Number.isInteger(row.calculatedPosition) || Number(row.calculatedPosition) < 1)
    return false;
  if (row.movementCode !== "CAD" && row.movementCode !== "CAT") return true;
  return (
    Boolean(row.requestedAssignmentCode && row.categoryCode) &&
    Boolean(progressShiftKind(row.requestedShift))
  );
}

function movementQueueLabel(row: ProgressEntryRow) {
  return `turno ${requestedShiftLabel(row.requestedShift)}, sin mezclar matutino, vespertino, nocturno, Jornada Acumulada ni móvil`;
}

function movementDestination(row: ProgressEntryRow) {
  const destination = cadDestination(row);
  return `${destination} · turno ${requestedShiftLabel(row.requestedShift)}`;
}

function queueDimensionParts(row: ProgressEntryRow) {
  const parts: string[] = [];
  if (row.requestedAssignmentCode)
    parts.push(`adscripción ${cadDestination(row)}`);
  if (row.categoryCode || row.categoryName)
    parts.push(`categoría ${cadCategory(row)}`);
  if (row.requestedShift)
    parts.push(`turno ${requestedShiftLabel(row.requestedShift)}`);
  return parts;
}

function genericQueueLabel(row: ProgressEntryRow) {
  const parts = queueDimensionParts(row);
  return parts.length ? parts.join(", ") : "la fila general del listado";
}

function missingQueueDimensions(row: ProgressEntryRow) {
  const missing: string[] = [];
  if (!row.requestedAssignmentCode) missing.push("adscripción");
  if (!row.categoryCode && !row.categoryName) missing.push("categoría");
  if (!row.requestedShift) missing.push("turno");
  return missing;
}

function freshnessLegend(row: ProgressEntryRow) {
  const latest = row.referenceLabel || readableDate(row.updatedAt);
  return `**El lugar puede variar; este resultado usa el listado con la última actualización disponible: ${latest}.**`;
}

function isClause97Status(row: ProgressEntryRow) {
  return (
    row.processType === "clausula_97" ||
    row.processType === "dispensa_clausula_97"
  );
}

function statusFreshnessLegend(row: ProgressEntryRow) {
  const latest =
    row.referenceLabel ||
    readableDate(row.statusUpdatedAt || row.updatedAt);
  return `**Estatus informado con la última actualización disponible: ${latest}.**`;
}

function printedProgressiveNote(row: ProgressEntryRow) {
  return row.progressiveDerived
    ? "El archivo no traía progresivo explícito y no se usa el orden derivado como lugar final."
    : `No se utiliza el progresivo ${row.progressiveNumber} impreso en el archivo como lugar final.`;
}

function deduplicateQueuePositions(
  entries: ProgressEntryRow[],
  coachedEntryIds = new Set<number>(),
) {
  const selected = new Map<string, ProgressEntryRow>();
  for (const entry of entries) {
    const movement = entry.movementCode === "CAD" || entry.movementCode === "CAT";
    const queueKind = progressShiftKind(entry.requestedShift) || "sin_turno";
    const key = movement
      ? [
          entry.listId,
          entry.movementCode,
          entry.categoryCode,
          entry.requestedAssignmentCode,
          queueKind,
        ].join("|")
      : [
          entry.listId,
          "LISTA",
          entry.categoryCode || entry.categoryName || "sin_categoria",
          entry.requestedAssignmentCode || "sin_adscripcion",
          queueKind,
        ].join("|");
    const previous = selected.get(key);
    if (
      !previous ||
      (coachedEntryIds.has(entry.id) && !coachedEntryIds.has(previous.id))
    )
      selected.set(key, entry);
  }
  return Array.from(selected.values());
}

function entryProcessType(row: ProgressEntryRow): ProgressProcessType {
  if (row.movementCode === "CAD") return "cambio_adscripcion";
  if (row.movementCode === "CAT") return "cambio_turno";
  return row.processType as ProgressProcessType;
}

function listMatchesProcessFilter(
  list: ActiveListRow,
  processFilter: Set<ProgressProcessType>,
) {
  if (!processFilter.size) return true;
  if (list.processType === "cambio_turno_adscripcion")
    return (
      processFilter.has("cambio_adscripcion") ||
      processFilter.has("cambio_turno") ||
      processFilter.has("cambio_turno_adscripcion")
    );
  return processFilter.has(list.processType as ProgressProcessType);
}

function resultSource(
  row: ProgressEntryRow,
  nameVerified: boolean,
  coaching?: ProgressCoachingRow,
): DeviSource {
  const processLabel = progressProcessLabel(
    entryProcessType(row),
    row.customProcessLabel,
  );
  const verification = nameVerified
    ? "Coincidencia verificada con la matrícula y el nombre del perfil."
    : "Consulta autorizada verificada por matrícula.";
  const movement = row.movementCode === "CAD" || row.movementCode === "CAT";
  const excerpt = isClause97Status(row)
    ? `${verification} Estatus: ${row.statusText || "Pendiente de captura"}.${row.unitText ? ` Adscripción: ${row.unitText}.` : ""}`
    : coaching
    ? `${verification} Lugar validado #${coaching.suggestedPosition} mediante entrenamiento autorizado de importancia ${coaching.importance}. Recomendación: ${coaching.searchRecommendation} El conteo automático del archivo ${hasCalculatedListPosition(row) ? `fue #${row.calculatedPosition}` : "estaba pendiente"}.`
    : hasCalculatedListPosition(row)
    ? movement
      ? `${verification} Lugar #${row.calculatedPosition} para ${movementDestination(row)}, calculado contando matrículas únicas de la categoría ${cadCategory(row)} en ${movementQueueLabel(row)}; no usa el número progresivo impreso.`
      : `${verification} Lugar #${row.calculatedPosition}, calculado contando matrículas únicas anteriores dentro de ${genericQueueLabel(row)}; el progresivo impreso no se toma como lugar final.`
    : `${verification} La posición por cola aún no pudo calcularse con los datos de agrupación disponibles.`;
  return {
    id: `progress-list-${row.listId}-entry-${row.id}`,
    document: `Listado interno: ${row.title} · ${row.originalName}`,
    page: row.rowNumber,
    heading: `${processLabel}${row.referenceLabel ? ` · ${row.referenceLabel}` : ""}`,
    locator: entryLocation(row),
    excerpt,
    sourceKind: "progress",
  };
}

function importanceLabel(value: ProgressCoachingRow["importance"]) {
  if (value === "alta") return "Alta";
  if (value === "baja") return "Baja";
  return "Media";
}

function resultLine(
  row: ProgressEntryRow,
  index: number,
  coaching?: ProgressCoachingRow,
) {
  const processLabel = progressProcessLabel(
    entryProcessType(row),
    row.customProcessLabel,
  );
  if (isClause97Status(row))
    return `${index + 1}. **${processLabel}: ${row.statusText || "PENDIENTE DE CAPTURA"}.**\n${row.fullName ? `Nombre: ${row.fullName}. ` : ""}${row.unitText ? `Adscripción: ${row.unitText}.` : ""}\nFuente: ${row.title} · archivo ${row.originalName} · ${entryLocation(row)}${row.referenceLabel ? ` · ${row.referenceLabel}` : ""}.\n${statusFreshnessLegend(row)}`;
  const movement = row.movementCode === "CAD" || row.movementCode === "CAT";
  if (coaching) {
    const queue = movement ? movementDestination(row) : genericQueueLabel(row);
    const automaticPosition = hasCalculatedListPosition(row)
      ? `#${row.calculatedPosition}`
      : "pendiente";
    return `${index + 1}. **${processLabel} · ${queue}: lugar validado #${coaching.suggestedPosition}.**\nEntrenamiento autorizado · importancia **${importanceLabel(coaching.importance)}**. Recomendación de búsqueda: ${coaching.searchRecommendation}\nControl: el conteo automático del archivo fue ${automaticPosition}; se conserva visible para comparar y auditar.${coaching.referenceLabel ? ` Referencia de validación: ${coaching.referenceLabel}.` : ""}\nFuente: ${row.title} · archivo ${row.originalName} · ${entryLocation(row)} · entrenamiento actualizado ${readableDate(coaching.updatedAt)}.\n${freshnessLegend(row)}`;
  }
  if (hasCalculatedListPosition(row) && movement)
    return `${index + 1}. **${processLabel} · ${movementDestination(row)}: lugar #${row.calculatedPosition}.**\nCálculo: una matrícula por destino dentro de ${cadCategory(row)}; ${movementQueueLabel(row)}. ${printedProgressiveNote(row)}\nFuente: ${row.title} · archivo ${row.originalName} · ${entryLocation(row)}${row.referenceLabel ? ` · ${row.referenceLabel}` : ""} · actualización ${readableDate(row.updatedAt)}.\n${freshnessLegend(row)}`;
  if (hasCalculatedListPosition(row)) {
    const missing = missingQueueDimensions(row);
    const limitation = missing.length
      ? ` La fuente no identifica ${missing.join(", ")} para esta fila; DeVi no inventa esos datos y calcula con las variables disponibles.`
      : "";
    return `${index + 1}. **${processLabel}: lugar #${row.calculatedPosition}.**\nCálculo: se contaron las matrículas únicas que aparecen antes dentro de ${genericQueueLabel(row)}. ${printedProgressiveNote(row)}${limitation}\nFuente: ${row.title} · archivo ${row.originalName} · ${entryLocation(row)}${row.referenceLabel ? ` · ${row.referenceLabel}` : ""} · actualización ${readableDate(row.updatedAt)}.\n${freshnessLegend(row)}`;
  }
  return `${index + 1}. **${processLabel}: posición pendiente de recalcular.**\nDeVi encontró la coincidencia, pero no mostrará el progresivo impreso como si fuera el lugar por adscripción, categoría y turno. El administrador debe actualizar este archivo para aplicar el conteo por cola.\nFuente: ${row.title} · archivo ${row.originalName} · ${entryLocation(row)}.\n${freshnessLegend(row)}`;
}

export async function answerProgressLookup(
  request: Request,
  message: string,
  accessMatricula: string,
): Promise<HybridDeviReply | null> {
  const intent = detectProgressLookupIntent(message);
  if (!intent.isLookup) return null;

  await ensureInitialClause97Data();

  const privilege = await getPrivilege(request);
  const requestedMatricula = intent.targetMatricula || accessMatricula;
  const isCrossMatriculaLookup = requestedMatricula !== accessMatricula;
  const authorizedCrossLookup =
    isCrossMatriculaLookup &&
    canConsultOtherProgressMatriculas(
      accessMatricula,
      privilege?.canAdmin,
      privilege?.canManageActs,
    );
  if (isCrossMatriculaLookup && !authorizedCrossLookup)
    return localReply(
      "Por protección de datos personales, tu sesión sólo puede consultar el progresivo de tu propia matrícula. Un administrador total o un perfil expresamente autorizado puede solicitar otra matrícula de forma auditada. Puedes preguntarme: **«¿En qué lugar voy en cambio de rama?»**",
    );

  if (authorizedCrossLookup)
    await audit(
      privilege?.actor || `matricula:${accessMatricula}`,
      "devi.progress-cross-matricula-lookup",
      "worker",
      requestedMatricula,
      JSON.stringify({ processTypes: intent.processTypes }),
    ).catch((error) =>
      console.error("devi.progress-cross-lookup-audit-failed", {
        actor: accessMatricula,
        target: requestedMatricula,
        error,
      }),
    );

  const [worker, entriesResult, activeListsResult, coachingResult] = await Promise.all([
    env.DB.prepare(
      "SELECT full_name AS fullName FROM workers WHERE matricula=? AND active=1 LIMIT 1",
    )
      .bind(requestedMatricula)
      .first<{ fullName: string }>(),
    env.DB.prepare(
      `SELECT e.id,e.list_id AS listId,e.progressive_number AS progressiveNumber,
        e.progressive_order AS progressiveOrder,e.progressive_derived AS progressiveDerived,
        e.matricula,e.full_name AS fullName,e.normalized_name AS normalizedName,
        e.unit_text AS unitText,e.status_text AS statusText,
        e.status_updated_at AS statusUpdatedAt,e.movement_code AS movementCode,
        e.category_code AS categoryCode,e.category_name AS categoryName,
        e.requested_assignment_code AS requestedAssignmentCode,
        e.requested_shift AS requestedShift,e.calculated_position AS calculatedPosition,
        e.sheet_name AS sheetName,e.row_number AS rowNumber,
        l.title,l.process_type AS processType,l.custom_process_label AS customProcessLabel,
        l.reference_label AS referenceLabel,l.original_name AS originalName,l.updated_at AS updatedAt
       FROM devi_progress_entries e
       JOIN devi_progress_lists l ON l.id=e.list_id
       WHERE e.matricula=? AND l.active=1
       ORDER BY l.updated_at DESC,e.progressive_order ASC,e.row_number ASC LIMIT 500`,
    )
      .bind(requestedMatricula)
      .all<ProgressEntryRow>(),
    env.DB.prepare(
      "SELECT id,process_type AS processType FROM devi_progress_lists WHERE active=1 ORDER BY updated_at DESC LIMIT 250",
    ).all<ActiveListRow>(),
    env.DB.prepare(
      `SELECT id,entry_id AS entryId,suggested_position AS suggestedPosition,
        search_recommendation AS searchRecommendation,importance,
        reference_label AS referenceLabel,updated_at AS updatedAt
       FROM devi_progress_coaching
       WHERE target_matricula=? AND active=1
       ORDER BY CASE importance WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         updated_at DESC LIMIT 500`,
    )
      .bind(requestedMatricula)
      .all<ProgressCoachingRow>(),
  ]);

  if (!worker?.fullName && !authorizedCrossLookup)
    return localReply(
      `No encontré un perfil activo para la matrícula ${requestedMatricula}. Por seguridad necesito comparar tanto la matrícula como el nombre del padrón antes de mostrar un progresivo. Solicita al administrador revisar o registrar ese perfil.`,
    );

  const processFilter = new Set(intent.processTypes);
  const relevantEntries = entriesResult.results.filter(
    (entry) =>
      !processFilter.size ||
      processFilter.has(entryProcessType(entry)),
  );
  const nameVerifiedEntries = worker?.fullName
    ? relevantEntries.filter((entry) =>
        progressNamesMatch(worker.fullName, entry.normalizedName),
      )
    : [];
  const nameVerifiedEntryIds = new Set(
    nameVerifiedEntries.map((entry) => entry.id),
  );
  const verifiedEntries = authorizedCrossLookup
    ? relevantEntries
    : nameVerifiedEntries;
  const usedAuthorizedMatriculaOnly =
    authorizedCrossLookup &&
    verifiedEntries.some((entry) => !nameVerifiedEntryIds.has(entry.id));
  const coachingByEntry = new Map(
    coachingResult.results.map((item) => [item.entryId, item]),
  );
  const relevantActiveLists = activeListsResult.results.filter(
    (list) => listMatchesProcessFilter(list, processFilter),
  );
  const needsMovementReprocessing =
    (processFilter.has("cambio_adscripcion") ||
      processFilter.has("cambio_turno")) &&
    entriesResult.results.some(
      (entry) =>
        entry.processType === "cambio_turno_adscripcion" &&
        !entry.movementCode,
    );

  if (!relevantActiveLists.length) {
    const requestedProcesses = intent.processTypes
      .map((type) => progressProcessLabel(type))
      .join(", ");
    return localReply(
      `Todavía no hay un listado activo${requestedProcesses ? ` de ${requestedProcesses}` : ""} en la base privada de DeVi. En cuanto el administrador suba el archivo vigente podrás volver a preguntar. **La ausencia de un archivo en DeVi no determina ni modifica tus derechos o solicitudes sindicales.**`,
    );
  }

  if (!verifiedEntries.length) {
    if (needsMovementReprocessing)
      return localReply(
        `La matrícula ${requestedMatricula} aparece en un listado combinado de adscripción y turno cargado antes de que DeVi separara los códigos. Para evitar confundir un CAD con un CAT no mostraré ese progresivo todavía. El administrador debe usar **Actualizar archivo** y seleccionar nuevamente el mismo PDF; después DeVi distinguirá **CAD = Cambio de Adscripción** y **CAT = Cambio de Turno**.`,
      );
    if (relevantEntries.length)
      return localReply(
        `Encontré la matrícula ${requestedMatricula} en un listado activo, pero el nombre del archivo no coincide suficientemente con el nombre del perfil. Por seguridad no mostraré el progresivo hasta que el administrador revise el archivo o el padrón. **Esta protección evita atribuir a una persona el lugar de otra.**`,
      );
    return localReply(
      `Comparé la matrícula ${requestedMatricula} y el nombre del perfil contra ${relevantActiveLists.length} listado${relevantActiveLists.length === 1 ? " activo" : "s activos"}, pero no encontré una coincidencia verificada. Puede significar que la matrícula aún no aparece en la versión vigente o que el listado correspondiente todavía no se ha cargado. Pide al administrador revisar el archivo más reciente.`,
    );
  }

  await hydrateProgressPositions(verifiedEntries);
  const missingMovementPositions = verifiedEntries.filter(
    (entry) =>
      (entry.movementCode === "CAD" || entry.movementCode === "CAT") &&
      !hasCalculatedListPosition(entry) &&
      !coachingByEntry.has(entry.id),
  );
  const displayableEntries = verifiedEntries.filter(
    (entry) =>
      coachingByEntry.has(entry.id) ||
      (entry.movementCode !== "CAD" && entry.movementCode !== "CAT") ||
      hasCalculatedListPosition(entry),
  );
  if (!displayableEntries.length && missingMovementPositions.length)
    return localReply(
      `Encontré la matrícula ${requestedMatricula} en el listado CAD/CAT activo, pero esa versión todavía conserva el progresivo del PDF y no tiene todos los datos necesarios para separar adscripción, categoría y turno. Para evitar informar un lugar incorrecto, el administrador debe usar **Actualizar archivo** y seleccionar nuevamente el PDF. DeVi entonces contará matrículas únicas desde el lugar 1 y separará Matutino, Vespertino, Nocturno, Jornada Acumulada y Móvil.`,
    );

  const distinctEntries = deduplicateQueuePositions(
    displayableEntries,
    new Set(coachingByEntry.keys()),
  );
  const visibleEntries = distinctEntries;
  const identityText = usedAuthorizedMatriculaOnly
    ? `la matrícula ${requestedMatricula} mediante una consulta autorizada. Las filas cuyo nombre no coincide exactamente con el padrón se verificaron sólo por la matrícula solicitada`
    : requestedMatricula === accessMatricula
      ? "tu matrícula y el nombre de tu perfil"
      : `la matrícula ${requestedMatricula} y el nombre de su perfil`;
  const clauseStatusOnly = visibleEntries.every(isClause97Status);
  const answer = [
    `Compañera o compañero: confirmé ${identityText} contra la versión activa de los listados privados.`,
    clauseStatusOnly
      ? `La matrícula aparece en ${visibleEntries.length} ${visibleEntries.length === 1 ? "registro activo" : "registros activos"} de Cláusula 97 o su dispensa.`
      : `La matrícula aparece ${verifiedEntries.length} ${verifiedEntries.length === 1 ? "vez" : "veces"}; DeVi la separó en ${visibleEntries.length} ${visibleEntries.length === 1 ? "posición" : "posiciones"} por adscripción, categoría y turno. Cada contador inicia en 1 y conserva el mismo lugar cuando una matrícula se repite dentro de la misma cola.`,
    visibleEntries
      .map((entry, index) => resultLine(entry, index, coachingByEntry.get(entry.id)))
      .join("\n\n"),
    missingMovementPositions.length
      ? "Hay además una versión CAD/CAT anterior que debe reprocesarse antes de poder calcular sus lugares con la nueva regla."
      : "",
    clauseStatusOnly
      ? "El estatus puede cambiar cuando Actas y Acuerdos publique una actualización y no sustituye el dictamen o acuerdo formal de la autoridad competente."
      : "Cada posición parte de las variables que realmente contiene la fila del archivo activo. Cuando existe entrenamiento autorizado, DeVi muestra el lugar validado junto al conteo automático, la recomendación y su importancia. El resultado puede variar cuando se publique una actualización y no sustituye el dictamen, movimiento o asignación formal de la autoridad competente.",
    "**Dato útil: DeVi nunca muestra el resto del listado; sólo devuelve las filas verificadas para la matrícula consultada.** Seguimos fortaleciendo la información y defensa de las y los compañeros del SNTSS Sección I Puebla.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return localReply(
    answer,
    visibleEntries.map((entry) =>
      resultSource(
        entry,
        nameVerifiedEntryIds.has(entry.id),
        coachingByEntry.get(entry.id),
      ),
    ),
  );
}
