import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import {
  GoogleDriveStorageError,
  deleteStoredDocument,
  downloadDriveDocument,
} from "../../google-drive/storage";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type RegistrationRow = {
  id: number;
  workerId: number;
  applicationId: number;
  email: string;
  curp: string;
  status: string;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  emailStatus: string;
  emailError: string | null;
  emailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  folio: string;
};

type AccessDocumentRow = {
  id: number;
  registrationId: number;
  kind: "tarjeton" | "ine";
  storageKey: string;
  storageProvider: string;
  driveFileId: string | null;
  driveFolderId: string | null;
  contentSha256: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-100);
}

async function registrationById(id: number) {
  return env.DB.prepare(
    `SELECT r.id,r.worker_id AS workerId,r.application_id AS applicationId,
      r.email,r.curp,r.status,r.review_notes AS reviewNotes,
      r.reviewed_by AS reviewedBy,r.reviewed_at AS reviewedAt,
      r.email_status AS emailStatus,r.email_error AS emailError,
      r.email_sent_at AS emailSentAt,r.created_at AS createdAt,
      r.updated_at AS updatedAt,w.matricula,w.full_name AS fullName,
      w.unit,w.category,a.folio
     FROM worker_access_registrations r
     JOIN workers w ON w.id=r.worker_id
     JOIN applications a ON a.id=r.application_id
     WHERE r.id=?`,
  )
    .bind(id)
    .first<RegistrationRow>();
}

async function downloadRegistrationDocument(documentId: number) {
  const document = await env.DB.prepare(
    `SELECT storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes
     FROM worker_access_registration_documents WHERE id=?`,
  )
    .bind(documentId)
    .first<{
      storageKey: string;
      storageProvider: string;
      driveFileId: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>();
  if (!document)
    return Response.json(
      { error: "Documento no encontrado" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  if (document.storageProvider === "drive" && document.driveFileId) {
    try {
      const source = await downloadDriveDocument(document.driveFileId);
      const headers = new Headers(NO_STORE_HEADERS);
      headers.set("content-type", document.mimeType || "application/pdf");
      headers.set(
        "content-disposition",
        `inline; filename="${safeFileName(document.fileName)}"`,
      );
      headers.set("x-content-type-options", "nosniff");
      return new Response(source.body, { headers });
    } catch (error) {
      if (error instanceof GoogleDriveStorageError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers: NO_STORE_HEADERS },
        );
      throw error;
    }
  }
  const source = await env.BUCKET.get(document.storageKey);
  if (!source)
    return Response.json(
      { error: "Archivo no disponible" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("content-type", document.mimeType || "application/pdf");
  headers.set(
    "content-disposition",
    `inline; filename="${safeFileName(document.fileName)}"`,
  );
  headers.set("content-length", String(source.size));
  headers.set("x-content-type-options", "nosniff");
  return new Response(source.body, { headers });
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const parameters = new URL(request.url).searchParams;
  const documentId = Number(parameters.get("documentId"));
  if (documentId) return downloadRegistrationDocument(documentId);
  const registrations = await env.DB.prepare(
    `SELECT r.id,r.worker_id AS workerId,r.application_id AS applicationId,
      r.email,r.curp,r.status,r.review_notes AS reviewNotes,
      r.reviewed_by AS reviewedBy,r.reviewed_at AS reviewedAt,
      r.email_status AS emailStatus,r.email_error AS emailError,
      r.email_sent_at AS emailSentAt,r.created_at AS createdAt,
      r.updated_at AS updatedAt,w.matricula,w.full_name AS fullName,
      w.unit,w.category,a.folio
     FROM worker_access_registrations r
     JOIN workers w ON w.id=r.worker_id
     JOIN applications a ON a.id=r.application_id
     WHERE r.status='pending'
     ORDER BY r.updated_at DESC,r.id DESC
     LIMIT 300`,
  ).all<RegistrationRow>();
  if (!registrations.results.length)
    return Response.json(
      { registrations: [] },
      { headers: NO_STORE_HEADERS },
    );
  const ids = registrations.results.map((item) => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const documents = await env.DB.prepare(
    `SELECT id,registration_id AS registrationId,kind,
      storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId,drive_folder_id AS driveFolderId,
      content_sha256 AS contentSha256,file_name AS fileName,
      mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt
     FROM worker_access_registration_documents
     WHERE registration_id IN (${placeholders}) ORDER BY id`,
  )
    .bind(...ids)
    .all<AccessDocumentRow>();
  return Response.json(
    {
      registrations: registrations.results.map((registration) => ({
        ...registration,
        documents: documents.results.filter(
          (document) => document.registrationId === registration.id,
        ),
      })),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  let payload: {
    id?: number;
    action?: "approve" | "reject";
    notes?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json(
      { error: "Solicitud inválida" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const id = Number(payload.id);
  const action = payload.action;
  const notes = payload.notes?.trim() || "";
  if (!id || !["approve", "reject"].includes(action || ""))
    return Response.json(
      { error: "Acción inválida" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const registration = await registrationById(id);
  if (!registration)
    return Response.json(
      { error: "Registro no encontrado" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  if (registration.status !== "pending")
    return Response.json(
      { error: "Este registro ya fue atendido." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  if (action === "reject") {
    if (notes.length < 5)
      return Response.json(
        { error: "Escribe el motivo de la corrección solicitada." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    await env.DB.prepare(
      `UPDATE worker_access_registrations
       SET status='rejected',review_notes=?,reviewed_by=?,
         reviewed_at=CURRENT_TIMESTAMP,email_status='not_sent',
         email_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    )
      .bind(notes, privilege.actor, id)
      .run();
    await audit(
      privilege.actor,
      "worker.access_registration_rejected",
      "worker_access_registration",
      id,
      notes,
    );
    return Response.json(
      { ok: true, message: "Se solicitaron correcciones al registro." },
      { headers: NO_STORE_HEADERS },
    );
  }
  const documents = await env.DB.prepare(
    `SELECT id,registration_id AS registrationId,kind,
      storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId,drive_folder_id AS driveFolderId,
      content_sha256 AS contentSha256,file_name AS fileName,
      mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt
     FROM worker_access_registration_documents WHERE registration_id=?`,
  )
    .bind(id)
    .all<AccessDocumentRow>();
  const tarjeton = documents.results.find((item) => item.kind === "tarjeton");
  const ine = documents.results.find((item) => item.kind === "ine");
  if (!tarjeton || !ine)
    return Response.json(
      { error: "No se puede aprobar: falta el tarjetón o la INE." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const existingDocuments = await env.DB.prepare(
    `SELECT id,kind,storage_key AS storageKey,
      storage_provider AS storageProvider,drive_file_id AS driveFileId
     FROM verification_documents
     WHERE application_id=? AND beneficiary_id IS NULL
       AND kind IN ('tarjeton','ine') ORDER BY id DESC`,
  )
    .bind(registration.applicationId)
    .all<{
      id: number;
      kind: string;
      storageKey: string;
      storageProvider: string;
      driveFileId: string | null;
    }>();
  const promotedDocuments = [tarjeton, ine];
  const statements = promotedDocuments.flatMap((document) => {
    const matching = existingDocuments.results.filter(
      (item) => item.kind === document.kind,
    );
    const existing = matching[0];
    if (existing) {
      const updates = [env.DB.prepare(
        `UPDATE verification_documents SET storage_key=?,storage_provider=?,
          drive_file_id=?,drive_folder_id=?,content_sha256=?,file_name=?,
          mime_type=?,size_bytes=?,verification_status='verified',
          match_score=100,verification_reason='Validado en el registro de acceso',
          reviewer_notes=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,
          client_upload_id=NULL,created_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).bind(
        document.storageKey,
        document.storageProvider,
        document.driveFileId,
        document.driveFolderId,
        document.contentSha256,
        document.fileName,
        document.mimeType,
        document.sizeBytes,
        notes || null,
        privilege.actor,
        existing.id,
      )];
      if (matching.length > 1)
        updates.push(
          env.DB.prepare(
            `DELETE FROM verification_documents
             WHERE application_id=? AND beneficiary_id IS NULL
               AND kind=? AND id<>?`,
          ).bind(registration.applicationId, document.kind, existing.id),
        );
      return updates;
    }
    return [env.DB.prepare(
      `INSERT INTO verification_documents
        (application_id,beneficiary_id,kind,storage_key,storage_provider,
         drive_file_id,drive_folder_id,content_sha256,file_name,mime_type,
         size_bytes,verification_status,match_score,verification_reason,
         reviewer_notes,reviewed_by,reviewed_at,created_at)
       VALUES (?,NULL,?,?,?,?,?,?,?,?,?,'verified',100,
         'Validado en el registro de acceso',?,?,CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP)`,
    ).bind(
      registration.applicationId,
      document.kind,
      document.storageKey,
      document.storageProvider,
      document.driveFileId,
      document.driveFolderId,
      document.contentSha256,
      document.fileName,
      document.mimeType,
      document.sizeBytes,
      notes || null,
      privilege.actor,
    )];
  });
  await env.DB.batch([
    ...statements,
    env.DB.prepare(
      `UPDATE workers SET email=?,curp=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(registration.email, registration.curp, registration.workerId),
    env.DB.prepare(
      `UPDATE applications SET curp=?,document_status=CASE
         WHEN status='approved' AND document_status='verified'
           THEN document_status ELSE 'manual_review' END
       WHERE id=?`,
    ).bind(registration.curp, registration.applicationId),
    env.DB.prepare(
      `UPDATE worker_access_registrations
       SET status='approved',review_notes=?,reviewed_by=?,
         reviewed_at=CURRENT_TIMESTAMP,email_status='manual',email_error=NULL,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(notes || null, privilege.actor, id),
    env.DB.prepare(
      "DELETE FROM worker_access_registration_documents WHERE registration_id=?",
    ).bind(id),
  ]);
  await Promise.allSettled(
    existingDocuments.results
      .filter(
        (oldDocument) =>
          !promotedDocuments.some(
            (newDocument) => newDocument.storageKey === oldDocument.storageKey,
          ),
      )
      .map((document) => deleteStoredDocument(document)),
  );
  await audit(
    privilege.actor,
    "worker.access_registration_approved",
    "worker_access_registration",
    id,
    registration.matricula,
  );
  return Response.json(
    {
      ok: true,
      emailSent: false,
      notifyManually: true,
      message: `Registro aprobado. La matrícula ${registration.matricula} ya puede ingresar con correo + CURP.`,
    },
    { headers: NO_STORE_HEADERS },
  );
}
