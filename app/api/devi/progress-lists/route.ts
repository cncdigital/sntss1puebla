import { env } from "cloudflare:workers";
import { audit, getPrivilege } from "../../authz";
import {
  MAX_PROGRESS_FILE_BYTES,
  parseProgressDocument,
  PROGRESS_LIST_ACCEPT,
} from "../../../devi/progress-lists";
import {
  isProgressProcessType,
  progressProcessLabel,
} from "../../../devi/progress-list-types";
import { ensureInitialClause97Data } from "../../../devi/clause97-initial-data";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const CLAUSE_97_PROCESS_TYPES = new Set([
  "clausula_97",
  "dispensa_clausula_97",
]);

function isClause97Process(value: string) {
  return CLAUSE_97_PROCESS_TYPES.has(value);
}

async function progressManager(request: Request) {
  const privilege = await getPrivilege(request);
  return privilege &&
    (privilege.canAdmin || privilege.canTrainDevi || privilege.canManageActs)
    ? privilege
    : null;
}

function actsOnly(privilege: NonNullable<Awaited<ReturnType<typeof progressManager>>>) {
  return privilege.canManageActs && !privilege.canAdmin && !privilege.canTrainDevi;
}

type ProgressListRow = {
  id: number;
  title: string;
  processType: string;
  customProcessLabel: string | null;
  referenceLabel: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sheetNamesJson: string;
  rowCount: number;
  skippedRows: number;
  uploadedBy: string;
  active: number;
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

function normalizedTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeFileName(value: string) {
  const extension = value.toLowerCase().match(/\.(xlsx|xls|csv|pdf)$/)?.[0] || "";
  const stem = value
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 105);
  return `${stem || "listado-progresivo"}${extension}`;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function removePartialList(listId: number, storageKey: string | null) {
  if (listId) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM devi_progress_entries WHERE list_id=?").bind(
        listId,
      ),
      env.DB.prepare("DELETE FROM devi_progress_lists WHERE id=?").bind(listId),
    ]).catch(() => undefined);
  }
  if (storageKey) await env.BUCKET.delete(storageKey).catch(() => undefined);
}

function publicList(row: ProgressListRow) {
  let sheetNames: string[] = [];
  try {
    const parsed = JSON.parse(row.sheetNamesJson) as unknown;
    if (Array.isArray(parsed))
      sheetNames = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    sheetNames = [];
  }
  return {
    id: row.id,
    title: row.title,
    processType: row.processType,
    processLabel: progressProcessLabel(row.processType, row.customProcessLabel),
    customProcessLabel: row.customProcessLabel,
    referenceLabel: row.referenceLabel,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sheetNames,
    rowCount: row.rowCount,
    skippedRows: row.skippedRows,
    uploadedBy: row.uploadedBy,
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const privilege = await progressManager(request);
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const parameters = new URL(request.url).searchParams;
  const downloadId = Number(parameters.get("download") || 0);
  if (downloadId > 0) {
    const source = await env.DB.prepare(
      `SELECT original_name AS originalName,mime_type AS mimeType,storage_key AS storageKey,
        process_type AS processType
       FROM devi_progress_lists WHERE id=?`,
    )
      .bind(downloadId)
      .first<{
        originalName: string;
        mimeType: string;
        storageKey: string;
        processType: string;
      }>();
    if (!source)
      return Response.json({ error: "Listado no encontrado." }, { status: 404 });
    if (actsOnly(privilege) && !isClause97Process(source.processType))
      return Response.json({ error: "No autorizado" }, { status: 403 });
    const object = await env.BUCKET.get(source.storageKey);
    if (!object)
      return Response.json({ error: "Archivo no disponible." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": source.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename="${safeFileName(source.originalName)}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const clauseOnly =
    actsOnly(privilege) || parameters.get("scope") === "clause97";
  if (clauseOnly) await ensureInitialClause97Data();
  const listWhere = clauseOnly
    ? "WHERE process_type IN ('clausula_97','dispensa_clausula_97')"
    : "";
  const [lists, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT id,title,process_type AS processType,custom_process_label AS customProcessLabel,
        reference_label AS referenceLabel,original_name AS originalName,mime_type AS mimeType,
        size_bytes AS sizeBytes,sheet_names_json AS sheetNamesJson,row_count AS rowCount,
        skipped_rows AS skippedRows,uploaded_by AS uploadedBy,active,
        created_at AS createdAt,updated_at AS updatedAt
       FROM devi_progress_lists ${listWhere} ORDER BY active DESC,updated_at DESC LIMIT 250`,
    ).all<ProgressListRow>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS totalLists,
        COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS activeLists,
        COALESCE(SUM(CASE WHEN active=1 THEN row_count ELSE 0 END),0) AS activeRows
       FROM devi_progress_lists ${listWhere}`,
    ).first<Record<string, number>>(),
  ]);
  return Response.json(
    {
      lists: lists.results.map(publicList),
      stats: {
        totalLists: Number(totals?.totalLists || 0),
        activeLists: Number(totals?.activeLists || 0),
        activeRows: Number(totals?.activeRows || 0),
      },
      acceptedFormats: PROGRESS_LIST_ACCEPT,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await progressManager(request);
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal del perfil protegido de DeVi." },
      { status: 428, headers: NO_STORE_HEADERS },
    );

  let listId = 0;
  let storageKey: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json(
        { error: "Selecciona un archivo Excel, CSV o PDF." },
        { status: 400 },
      );
    if (!file.size || file.size > MAX_PROGRESS_FILE_BYTES)
      return Response.json(
        { error: "El archivo está vacío o supera el límite de 15 MB." },
        { status: 400 },
      );
    if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name))
      return Response.json(
        {
          error:
            "Formato no permitido. Usa Excel (.xlsx, .xls), CSV o PDF con texto seleccionable.",
        },
        { status: 400 },
      );
    const title = cleanText(form.get("title"), 160);
    if (title.length < 4)
      return Response.json(
        { error: "Escribe un título de al menos 4 caracteres para identificar el listado." },
        { status: 400 },
      );
    const processTypeValue = cleanText(form.get("processType"), 40);
    if (!isProgressProcessType(processTypeValue))
      return Response.json({ error: "Selecciona un tipo de listado válido." }, { status: 400 });
    if (actsOnly(privilege) && !isClause97Process(processTypeValue))
      return Response.json(
        { error: "El rol Actas y Acuerdos sólo puede administrar Cláusula 97 y sus dispensas." },
        { status: 403 },
      );
    const customProcessLabel =
      processTypeValue === "otro"
        ? cleanText(form.get("customProcessLabel"), 100)
        : null;
    if (processTypeValue === "otro" && (customProcessLabel?.length || 0) < 3)
      return Response.json(
        { error: "Escribe el nombre del proceso para el listado de tipo Otro." },
        { status: 400 },
      );
    const referenceLabel = cleanText(form.get("referenceLabel"), 280) || null;
    const replaceListId = Number(form.get("replaceListId") || 0);
    if (replaceListId && (!Number.isInteger(replaceListId) || replaceListId < 1))
      return Response.json(
        { error: "El archivo seleccionado para actualizar no es válido." },
        { status: 400 },
      );
    if (replaceListId) {
      const previous = await env.DB.prepare(
        "SELECT id,process_type AS processType FROM devi_progress_lists WHERE id=? LIMIT 1",
      )
        .bind(replaceListId)
        .first<{ id: number; processType: string }>();
      if (!previous)
        return Response.json(
          { error: "La versión que intentas actualizar ya no existe." },
          { status: 404 },
        );
      if (actsOnly(privilege) && !isClause97Process(previous.processType))
        return Response.json({ error: "No autorizado" }, { status: 403 });
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const contentSha256 = await sha256Hex(fileBytes);
    if (!replaceListId) {
      const existing = await env.DB.prepare(
        `SELECT id,title,process_type AS processType,
          custom_process_label AS customProcessLabel,
          reference_label AS referenceLabel,row_count AS rowCount,active
         FROM devi_progress_lists WHERE content_sha256=?
         ORDER BY active DESC,updated_at DESC LIMIT 1`,
      )
        .bind(contentSha256)
        .first<{
          id: number;
          title: string;
          processType: string;
          customProcessLabel: string | null;
          referenceLabel: string | null;
          rowCount: number;
          active: number;
        }>();
      if (existing)
        return Response.json(
          {
            error:
              "Este mismo archivo ya está registrado. Puedes reprocesarlo como una nueva versión sin volver a seleccionarlo.",
            existingListId: existing.id,
            existingTitle: existing.title,
            existingProcessType: existing.processType,
            existingCustomProcessLabel: existing.customProcessLabel,
            existingReferenceLabel: existing.referenceLabel,
            existingRows: existing.rowCount,
            existingActive: Boolean(existing.active),
          },
          { status: 409, headers: NO_STORE_HEADERS },
        );
    }
    const parsed = await parseProgressDocument(fileBytes, file.name);
    storageKey = `devi-progress-lists/${new Date()
      .toISOString()
      .slice(0, 10)}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    await env.BUCKET.put(storageKey, fileBytes, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
      customMetadata: {
        uploadedBy: privilege.actor,
        purpose: "devi-private-progress-list",
      },
    });

    const created = await env.DB.prepare(
      `INSERT INTO devi_progress_lists
        (title,normalized_title,process_type,custom_process_label,reference_label,
         original_name,mime_type,size_bytes,storage_key,content_sha256,sheet_names_json,
         row_count,skipped_rows,uploaded_by,active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING id`,
    )
      .bind(
        title,
        normalizedTitle(title),
        processTypeValue,
        customProcessLabel,
        referenceLabel,
        cleanText(file.name, 180),
        file.type || "application/octet-stream",
        file.size,
        storageKey,
        contentSha256,
        JSON.stringify(parsed.sheetNames),
        parsed.entries.length,
        parsed.skippedRows,
        privilege.actor,
      )
      .first<{ id: number }>();
    listId = Number(created?.id || 0);
    if (!listId) throw new Error("progress_list_not_created");

    for (let offset = 0; offset < parsed.entries.length; offset += 70) {
      const statements = parsed.entries.slice(offset, offset + 70).map((entry) =>
        env.DB.prepare(
          `INSERT INTO devi_progress_entries
            (list_id,progressive_number,progressive_order,progressive_derived,
             matricula,full_name,normalized_name,unit_text,status_text,status_updated_at,status_updated_by,
             movement_code,category_code,category_name,
             requested_assignment_code,requested_shift,calculated_position,
             sheet_name,row_number,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        ).bind(
          listId,
          entry.progressiveNumber,
          entry.progressiveOrder,
          entry.progressiveDerived ? 1 : 0,
          entry.matricula,
          entry.fullName,
          entry.normalizedName,
          entry.unitText,
          entry.statusText,
          entry.statusText ? new Date().toISOString() : null,
          entry.statusText ? privilege.actor : null,
          entry.movementCode,
          entry.categoryCode,
          entry.categoryName,
          entry.requestedAssignmentCode,
          entry.requestedShift,
          entry.calculatedPosition,
          entry.sheetName,
          entry.rowNumber,
        ),
      );
      await env.DB.batch(statements);
    }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE devi_progress_lists SET active=0,updated_at=CURRENT_TIMESTAMP
         WHERE (normalized_title=? OR id=?) AND id<>? AND active=1`,
      ).bind(normalizedTitle(title), replaceListId || -1, listId),
      env.DB.prepare(
        `UPDATE devi_progress_lists SET active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).bind(listId),
    ]);
    await audit(
      privilege.actor,
      "devi.progress-list-uploaded",
      "devi_progress_list",
      listId,
      JSON.stringify({
        title,
        processType: processTypeValue,
        rows: parsed.entries.length,
        sheets: parsed.sheetNames,
        fileName: cleanText(file.name, 180),
        replacesListId: replaceListId || null,
      }),
    ).catch((error) => console.error("devi.progress-list-audit-failed", error));

    return Response.json(
      {
        ok: true,
        listId,
        rows: parsed.entries.length,
        sheets: parsed.sheetNames,
        skippedRows: parsed.skippedRows,
        derivedSheets: parsed.derivedSheets,
        message: isClause97Process(processTypeValue)
          ? replaceListId
            ? "Nueva versión incorporada y activada. La anterior quedó conservada como historial y DeVi ya consulta los estatus más recientes."
            : "Archivo incorporado y activado. DeVi ya puede informar el estatus de Cláusula 97 por matrícula."
          : replaceListId
            ? "Nueva versión incorporada y activada. La versión anterior quedó conservada como historial y DeVi ya consulta el archivo más reciente, incluidos los lugares CAD y CAT calculados."
            : "Listado incorporado y activado. DeVi ya puede consultar progresivos y lugares CAD/CAT con matrícula y nombre verificados.",
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    await removePartialList(listId, storageKey);
    const message = error instanceof Error ? error.message : "progress_list_failed";
    if (/UNIQUE|constraint|content_sha256/i.test(message))
      return Response.json(
        { error: "Este mismo archivo ya fue incorporado a los listados de DeVi." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    console.error("devi.progress-list-upload-failed", {
      actor: privilege.actor,
      reason: message.slice(0, 220),
    });
    return Response.json(
      {
        error:
          message === "progress_list_failed" || message === "progress_list_not_created"
            ? "No fue posible incorporar el listado. Intenta nuevamente."
            : message,
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

export async function DELETE(request: Request) {
  const privilege = await progressManager(request);
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (privilege.mustChangePin)
    return Response.json(
      { error: "Cambia primero la contraseña temporal del perfil protegido de DeVi." },
      { status: 428, headers: NO_STORE_HEADERS },
    );
  let body: { id?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Listado inválido." }, { status: 400 });
  const list = await env.DB.prepare(
    `SELECT title,storage_key AS storageKey,row_count AS rowCount,process_type AS processType
     FROM devi_progress_lists WHERE id=?`,
  )
    .bind(id)
    .first<{ title: string; storageKey: string; rowCount: number; processType: string }>();
  if (!list)
    return Response.json({ error: "Listado no encontrado." }, { status: 404 });
  if (actsOnly(privilege) && !isClause97Process(list.processType))
    return Response.json({ error: "No autorizado" }, { status: 403 });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM devi_progress_entries WHERE list_id=?").bind(id),
    env.DB.prepare("DELETE FROM devi_progress_lists WHERE id=?").bind(id),
  ]);
  await env.BUCKET.delete(list.storageKey).catch((error) =>
    console.error("devi.progress-list-object-delete-failed", { id, error }),
  );
  await audit(
    privilege.actor,
    "devi.progress-list-deleted",
    "devi_progress_list",
    id,
    JSON.stringify({ title: list.title, rows: list.rowCount }),
  ).catch((error) => console.error("devi.progress-list-audit-failed", error));
  return Response.json(
    {
      ok: true,
      message: "Listado y sus registros fueron eliminados de la base consultable de DeVi.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
