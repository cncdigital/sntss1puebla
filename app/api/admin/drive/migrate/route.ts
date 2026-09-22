import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../../authz";
import {
  GoogleDriveStorageError,
  type DriveDocumentKind,
  trashDriveDocument,
  uploadLegalDocumentToDrive,
} from "../../../google-drive/storage";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

async function migrationCounts() {
  const [counts, accessCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN drive_file_id IS NOT NULL THEN 1 ELSE 0 END) AS synced,
        SUM(CASE WHEN drive_file_id IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN legacy_cleanup_pending=1 THEN 1 ELSE 0 END) AS cleanupPending
       FROM verification_documents
       WHERE kind IN ('ine','tarjeton','beneficiary_evidence','beneficiary_curp')`,
    ).first<{
      total: number;
      synced: number | null;
      pending: number | null;
      cleanupPending: number | null;
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN drive_file_id IS NOT NULL THEN 1 ELSE 0 END) AS synced,
        SUM(CASE WHEN drive_file_id IS NULL THEN 1 ELSE 0 END) AS pending
       FROM worker_access_registration_documents
       WHERE kind IN ('ine','tarjeton')`,
    ).first<{
      total: number;
      synced: number | null;
      pending: number | null;
    }>(),
  ]);
  return {
    total:
      Number(counts?.total || 0) + Number(accessCounts?.total || 0),
    synced:
      Number(counts?.synced || 0) + Number(accessCounts?.synced || 0),
    pending:
      Number(counts?.pending || 0) + Number(accessCounts?.pending || 0),
    cleanupPending: Number(counts?.cleanupPending || 0),
  };
}

async function restoreLegacyCopiesAsPrimary(limit = 25) {
  const pending = await env.DB.prepare(
    `SELECT id,legacy_storage_key AS legacyStorageKey
     FROM verification_documents
     WHERE storage_provider='drive' AND legacy_cleanup_pending=1
       AND legacy_storage_key IS NOT NULL LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: number; legacyStorageKey: string }>();
  let restored = 0;
  for (const document of pending.results) {
    try {
      const object = await env.BUCKET.head(document.legacyStorageKey);
      if (!object) continue;
      await env.DB.prepare(
        `UPDATE verification_documents SET storage_provider='r2',storage_key=?,
          legacy_storage_key=NULL,legacy_cleanup_pending=0 WHERE id=?`,
      )
        .bind(document.legacyStorageKey, document.id)
        .run();
      restored += 1;
    } catch {
      // Se conserva la copia anterior para reintentar sin perder trazabilidad.
    }
  }
  return restored;
}

async function retryQueuedCleanup(limit = 25) {
  const pending = await env.DB.prepare(
    `SELECT id,storage_provider AS storageProvider,storage_key AS storageKey,
      drive_file_id AS driveFileId
     FROM document_storage_cleanup_queue
     ORDER BY attempts,id LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: number;
      storageProvider: "drive" | "r2";
      storageKey: string;
      driveFileId: string | null;
    }>();
  let cleaned = 0;
  for (const item of pending.results) {
    try {
      if (item.storageProvider === "drive" && item.driveFileId)
        await trashDriveDocument(item.driveFileId);
      else await env.BUCKET.delete(item.storageKey);
      await env.DB.prepare("DELETE FROM document_storage_cleanup_queue WHERE id=?")
        .bind(item.id)
        .run();
      cleaned += 1;
    } catch (error) {
      await env.DB.prepare(
        `UPDATE document_storage_cleanup_queue SET attempts=attempts+1,
          last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
        .bind(
          error instanceof Error ? error.message.slice(0, 500) : "Error de limpieza",
          item.id,
        )
        .run();
    }
  }
  return cleaned;
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  return Response.json(await migrationCounts(), { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  await Promise.all([restoreLegacyCopiesAsPrimary(), retryQueuedCleanup()]);
  const documents = await env.DB.prepare(
    `SELECT * FROM (
       SELECT 'credential' AS source,vd.id,
         vd.application_id AS applicationId,
         vd.beneficiary_id AS beneficiaryId,vd.kind,
         vd.storage_key AS storageKey,vd.file_name AS fileName,
         vd.mime_type AS mimeType,vd.size_bytes AS sizeBytes,w.matricula
       FROM verification_documents vd
       JOIN applications a ON a.id=vd.application_id
       JOIN workers w ON w.id=a.worker_id
       WHERE vd.kind IN ('ine','tarjeton','beneficiary_evidence','beneficiary_curp')
         AND vd.storage_provider='r2' AND vd.drive_file_id IS NULL
       UNION ALL
       SELECT 'access' AS source,rad.id,rar.application_id AS applicationId,
         NULL AS beneficiaryId,rad.kind,rad.storage_key AS storageKey,
         rad.file_name AS fileName,rad.mime_type AS mimeType,
         rad.size_bytes AS sizeBytes,w.matricula
       FROM worker_access_registration_documents rad
       JOIN worker_access_registrations rar ON rar.id=rad.registration_id
       JOIN workers w ON w.id=rar.worker_id
       WHERE rad.kind IN ('ine','tarjeton')
         AND rad.storage_provider='r2' AND rad.drive_file_id IS NULL
     ) ORDER BY source,id LIMIT 5`,
  ).all<{
    source: "credential" | "access";
    id: number;
    applicationId: number;
    beneficiaryId: number | null;
    kind: DriveDocumentKind;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    matricula: string;
  }>();
  let synced = 0;
  const errors: Array<{ id: number; message: string }> = [];
  for (const document of documents.results) {
    const object = await env.BUCKET.get(document.storageKey);
    if (!object) {
      errors.push({ id: document.id, message: "Archivo de origen no disponible" });
      continue;
    }
    let uploaded: Awaited<ReturnType<typeof uploadLegalDocumentToDrive>> | null = null;
    try {
      const bytes = await object.arrayBuffer();
      if (bytes.byteLength !== document.sizeBytes)
        throw new Error("El tamaño del archivo de origen no coincide con la base de datos");
      uploaded = await uploadLegalDocumentToDrive({
        bytes,
        originalFileName: document.fileName,
        matricula: document.matricula,
        kind: document.kind,
        applicationId: document.applicationId,
        beneficiaryId: document.beneficiaryId,
      });
      if (document.source === "credential")
        await env.DB.prepare(
          `UPDATE verification_documents SET
            drive_file_id=?,drive_folder_id=?,content_sha256=?,
            legacy_storage_key=NULL,legacy_cleanup_pending=0
           WHERE id=? AND storage_provider='r2' AND drive_file_id IS NULL`,
        )
          .bind(
            uploaded.driveFileId,
            uploaded.driveFolderId,
            uploaded.contentSha256,
            document.id,
          )
          .run();
      else
        await env.DB.prepare(
          `UPDATE worker_access_registration_documents SET
            drive_file_id=?,drive_folder_id=?,content_sha256=?
           WHERE id=? AND storage_provider='r2' AND drive_file_id IS NULL`,
        )
          .bind(
            uploaded.driveFileId,
            uploaded.driveFolderId,
            uploaded.contentSha256,
            document.id,
          )
          .run();
      synced += 1;
    } catch (error) {
      if (uploaded?.driveFileId)
        await trashDriveDocument(uploaded.driveFileId).catch(() => undefined);
      errors.push({
        id: document.id,
        message:
          error instanceof GoogleDriveStorageError || error instanceof Error
            ? error.message
            : "Error de sincronización",
      });
    }
  }
  const counts = await migrationCounts();
  await audit(
    privilege.actor,
    "google_drive.sync_batch",
    "storage",
    null,
    JSON.stringify({ synced, errors: errors.length, ...counts }),
  );
  return Response.json(
    {
      ok: errors.length === 0,
      batchSynced: synced,
      batchMigrated: synced,
      errors,
      ...counts,
    },
    {
      status: errors.length && synced === 0 ? 409 : 200,
      headers: NO_STORE_HEADERS,
    },
  );
}
