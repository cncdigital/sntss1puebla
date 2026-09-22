import { env } from "cloudflare:workers";
import { audit, getWorkerSession, requirePrivilege } from "../authz";
import { extractPdfText, verifyPdfText } from "../document-verification";
import {
  GoogleDriveStorageError,
  deleteStoredDocument,
  downloadDriveDocument,
  isGoogleDriveStorageActive,
  uploadLegalDocumentToDrive,
  type DriveDocumentKind,
} from "../google-drive/storage";
import {
  queueTicketFromRequest,
  touchRegistrationSlot,
} from "../registration-capacity/shared";

const PDF_KINDS = new Set([
  "tarjeton",
  "ine",
  "beneficiary_evidence",
  "beneficiary_curp",
]);
const PHOTO_KINDS = new Set(["profile_photo", "beneficiary_photo"]);
const ALL_KINDS = new Set([...PDF_KINDS, ...PHOTO_KINDS]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-100);
}

function byteText(bytes: Uint8Array, start: number, length: number) {
  return Array.from(bytes.slice(start, start + length), (byte) =>
    String.fromCharCode(byte),
  ).join("");
}

async function detectedPhotoMime(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    byteText(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (byteText(bytes, 0, 4) === "RIFF" && byteText(bytes, 8, 4) === "WEBP")
    return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  const queueTicket = queueTicketFromRequest(request);
  if (!(await touchRegistrationSlot(session.matricula, queueTicket)))
    return Response.json(
      {
        error: "Tu turno de carga terminó. Vuelve a enviar para recuperar el avance.",
        code: "REGISTRATION_SLOT_REQUIRED",
      },
      { status: 429 },
    );
  const form = await request.formData();
  const file = form.get("file");
  const applicationId = Number(form.get("applicationId"));
  const beneficiaryId = Number(form.get("beneficiaryId")) || null;
  const kind = String(form.get("kind") || "");
  const clientUploadId = String(form.get("uploadId") || "").trim();
  if (!(file instanceof File) || !applicationId || !ALL_KINDS.has(kind))
    return Response.json({ error: "Carga inválida." }, { status: 400 });
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(clientUploadId))
    return Response.json({ error: "Identificador de carga inválido." }, { status: 400 });
  if (!file.size || file.size > MAX_FILE_BYTES)
    return Response.json({ error: "Cada archivo debe pesar máximo 10 MB." }, { status: 400 });
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const photoMime = PHOTO_KINDS.has(kind) ? await detectedPhotoMime(file) : null;
  if (PDF_KINDS.has(kind) && !isPdf)
    return Response.json({ error: "El documento debe estar en formato PDF." }, { status: 400 });
  if (PHOTO_KINDS.has(kind) && !photoMime)
    return Response.json(
      {
        error:
          "La imagen no llegó como una foto JPG, PNG o WebP válida. Vuelve a seleccionarla; si es HEIC, usa JPG/Compatible.",
        code: "PHOTO_FORMAT_UNSUPPORTED",
      },
      { status: 400 },
    );
  const storedMimeType = PDF_KINDS.has(kind) ? "application/pdf" : photoMime!;
  const application = await env.DB.prepare(
    `SELECT a.id,a.status,w.matricula,w.full_name AS fullName
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE a.id=? AND w.matricula=? AND a.archived_at IS NULL`,
  )
    .bind(applicationId, session.matricula)
    .first<{ id: number; status: string; matricula: string; fullName: string }>();
  if (!application || application.status !== "draft")
    return Response.json({ error: "El expediente no admite nuevas cargas." }, { status: 409 });
  let beneficiary: {
    id: number;
    fullName: string;
    relationship: string;
    curp: string | null;
  } | null = null;
  if (beneficiaryId) {
    beneficiary = await env.DB.prepare(
      "SELECT id,full_name AS fullName,relationship,curp FROM beneficiaries WHERE id=? AND application_id=?",
    )
      .bind(beneficiaryId, applicationId)
      .first<{
        id: number;
        fullName: string;
        relationship: string;
        curp: string | null;
      }>();
    if (!beneficiary)
      return Response.json({ error: "Beneficiario no válido." }, { status: 404 });
  }
  if (kind.startsWith("beneficiary_") !== Boolean(beneficiaryId))
    return Response.json({ error: "La carga no corresponde al expediente." }, { status: 400 });
  if (
    kind === "beneficiary_curp" &&
    !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(
      beneficiary?.curp?.trim().toUpperCase() || "",
    )
  )
    return Response.json(
      { error: "Captura una CURP válida del beneficiario antes de subir la constancia." },
      { status: 409 },
    );
  const repeatedUpload = await env.DB.prepare(
    `SELECT id,kind,verification_status AS verificationStatus,match_score AS matchScore,
      verification_reason AS verificationReason,file_name AS fileName
     FROM verification_documents
     WHERE client_upload_id=? AND application_id=? AND beneficiary_id IS ? LIMIT 1`,
  )
    .bind(clientUploadId, applicationId, beneficiaryId)
    .first<{
      id: number;
      kind: string;
      verificationStatus: string;
      matchScore: number;
      verificationReason: string | null;
      fileName: string;
    }>();
  if (repeatedUpload && repeatedUpload.kind === kind)
    return Response.json({ ...repeatedUpload, idempotent: true });
  let verificationStatus = "auto_verified";
  let matchScore = 100;
  let verificationReason = "Archivo recibido correctamente.";
  if (PDF_KINDS.has(kind)) {
    const text = await extractPdfText(file);
    const result = verifyPdfText({
      kind,
      text,
      workerName: application.fullName,
      beneficiaryName: beneficiary?.fullName,
      beneficiaryCurp: beneficiary?.curp || undefined,
      relationship: beneficiary?.relationship,
    });
    verificationStatus = result.status;
    matchScore = result.score;
    verificationReason = result.reason;
  }
  const currentDocuments = await env.DB.prepare(
    `SELECT id,storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId,legacy_storage_key AS legacyStorageKey
     FROM verification_documents
     WHERE application_id=? AND beneficiary_id IS ? AND kind=? ORDER BY id DESC`,
  )
    .bind(applicationId, beneficiaryId, kind)
    .all<{
      id: number;
      storageKey: string;
      storageProvider: string;
      driveFileId: string | null;
      legacyStorageKey: string | null;
    }>();
  const current = currentDocuments.results[0];
  const storeInProtectedAppStorage = async () => {
    const storageKey = `expedientes/${applicationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    await env.BUCKET.put(storageKey, file.stream(), {
      httpMetadata: { contentType: storedMimeType },
      customMetadata: {
        applicationId: String(applicationId),
        kind,
        matricula: session.matricula,
      },
    });
    return {
      storageKey,
      storageProvider: "r2" as const,
      driveFileId: null,
      driveFolderId: null,
      contentSha256: null,
    };
  };
  const storedDocument: {
    storageKey: string;
    storageProvider: "r2" | "drive";
    driveFileId: string | null;
    driveFolderId: string | null;
    contentSha256: string | null;
  } = await storeInProtectedAppStorage();
  if (PDF_KINDS.has(kind) && (await isGoogleDriveStorageActive())) {
    try {
      const driveCopy = await uploadLegalDocumentToDrive({
        bytes: await file.arrayBuffer(),
        originalFileName: file.name,
        matricula: application.matricula,
        kind: kind as DriveDocumentKind,
        applicationId,
        beneficiaryId,
      });
      storedDocument.driveFileId = driveCopy.driveFileId;
      storedDocument.driveFolderId = driveCopy.driveFolderId;
      storedDocument.contentSha256 = driveCopy.contentSha256;
    } catch (error) {
      const code =
        error instanceof GoogleDriveStorageError
          ? error.code
          : "DRIVE_COPY_UNEXPECTED_ERROR";
      await audit(
        `matricula:${session.matricula}`,
        "google_drive.copy_deferred",
        "application",
        applicationId,
        `${kind}:${code}`,
      ).catch(() => undefined);
    }
  }
  let documentId: number | undefined;
  try {
    if (current) {
      const statements = [
        env.DB.prepare(
          `UPDATE verification_documents SET storage_key=?,storage_provider=?,
            drive_file_id=?,drive_folder_id=?,content_sha256=?,legacy_storage_key=NULL,
            legacy_cleanup_pending=0,file_name=?,mime_type=?,size_bytes=?,
            verification_status=?,match_score=?,verification_reason=?,client_upload_id=?,
            reviewer_notes=NULL,reviewed_by=NULL,reviewed_at=NULL,created_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        ).bind(
            storedDocument.storageKey,
            storedDocument.storageProvider,
            storedDocument.driveFileId,
            storedDocument.driveFolderId,
            storedDocument.contentSha256,
            file.name,
            storedMimeType,
            file.size,
            verificationStatus,
            matchScore,
            verificationReason,
            clientUploadId,
            current.id,
          ),
      ];
      if (currentDocuments.results.length > 1)
        statements.push(
          env.DB.prepare(
            `DELETE FROM verification_documents
             WHERE application_id=? AND beneficiary_id IS ? AND kind=? AND id<>?`,
          ).bind(applicationId, beneficiaryId, kind, current.id),
        );
      await env.DB.batch(statements);
      documentId = current.id;
    } else {
      const document = await env.DB.prepare(
        `INSERT INTO verification_documents
          (application_id,beneficiary_id,kind,storage_key,storage_provider,
           drive_file_id,drive_folder_id,content_sha256,file_name,mime_type,size_bytes,
           verification_status,match_score,verification_reason,client_upload_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
        .bind(
          applicationId,
          beneficiaryId,
          kind,
          storedDocument.storageKey,
          storedDocument.storageProvider,
          storedDocument.driveFileId,
          storedDocument.driveFolderId,
          storedDocument.contentSha256,
          file.name,
          storedMimeType,
          file.size,
          verificationStatus,
          matchScore,
          verificationReason,
          clientUploadId,
        )
        .first<{ id: number }>();
      documentId = document?.id;
    }
  } catch (error) {
    await deleteStoredDocument({
      storageProvider: storedDocument.storageProvider,
      storageKey: storedDocument.storageKey,
      driveFileId: storedDocument.driveFileId,
    }).catch(() => undefined);
    throw error;
  }
  await Promise.allSettled(
    currentDocuments.results
      .filter((item) => item.storageKey && item.storageKey !== storedDocument.storageKey)
      .map((item) => deleteStoredDocument(item)),
  );
  if (kind === "profile_photo")
    await env.DB.prepare("UPDATE applications SET profile_photo_key=? WHERE id=?")
      .bind(storedDocument.storageKey, applicationId)
      .run();
  if (kind === "beneficiary_photo")
    await env.DB.prepare("UPDATE beneficiaries SET photo_key=? WHERE id=?")
      .bind(storedDocument.storageKey, beneficiaryId)
      .run();
  await audit(`matricula:${session.matricula}`, "document.uploaded", "application", applicationId, kind);
  return Response.json(
    {
      id: documentId,
      kind,
      fileName: file.name,
      verificationStatus,
      matchScore,
      verificationReason,
      storageProvider: storedDocument.storageProvider,
    },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "Documento inválido" }, { status: 400 });
  const document = await env.DB.prepare(
    `SELECT storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes FROM verification_documents WHERE id=?`,
  )
    .bind(id)
    .first<{
      storageKey: string;
      storageProvider: string;
      driveFileId: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>();
  if (!document)
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  if (document.storageProvider === "drive" && document.driveFileId) {
    try {
      const driveResponse = await downloadDriveDocument(document.driveFileId);
      const headers = new Headers();
      headers.set("content-type", document.mimeType || "application/pdf");
      headers.set(
        "content-disposition",
        `inline; filename="${safeFileName(document.fileName)}"`,
      );
      headers.set(
        "content-length",
        driveResponse.headers.get("content-length") || String(document.sizeBytes),
      );
      headers.set("cache-control", "private, no-store, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("x-content-type-options", "nosniff");
      return new Response(driveResponse.body, { headers });
    } catch (error) {
      if (error instanceof GoogleDriveStorageError)
        return Response.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      throw error;
    }
  }
  const object = await env.BUCKET.get(document.storageKey);
  if (!object)
    return Response.json({ error: "Archivo no disponible" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const mimeType =
    document.mimeType ||
    object.httpMetadata?.contentType ||
    (document.fileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/octet-stream");
  headers.set("content-type", mimeType);
  headers.set(
    "content-disposition",
    `inline; filename="${safeFileName(document.fileName)}"`,
  );
  headers.set("content-length", String(object.size));
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const { id, status, notes = "" } = (await request.json()) as {
    id?: number;
    status?: "verified" | "rejected";
    notes?: string;
  };
  if (!id || !["verified", "rejected"].includes(status ?? ""))
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  if (status === "rejected" && notes.trim().length < 5)
    return Response.json(
      { error: "Escribe el motivo de la observación para orientar al trabajador." },
      { status: 400 },
    );
  const document = await env.DB.prepare(
    "SELECT application_id AS applicationId,beneficiary_id AS beneficiaryId,kind FROM verification_documents WHERE id=?",
  )
    .bind(id)
    .first<{ applicationId: number; beneficiaryId: number | null; kind: string }>();
  if (!document)
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  await env.DB.prepare(
    `UPDATE verification_documents SET verification_status=?,reviewer_notes=?,
      reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
  )
    .bind(status, notes.trim() || null, privilege.actor, id)
    .run();
  if (
    document.beneficiaryId &&
    ["beneficiary_evidence", "beneficiary_curp"].includes(document.kind)
  ) {
    const beneficiaryDocuments = await env.DB.prepare(
      `SELECT kind,verification_status AS verificationStatus
       FROM verification_documents
       WHERE beneficiary_id=? AND kind IN ('beneficiary_evidence','beneficiary_curp')`,
    )
      .bind(document.beneficiaryId)
      .all<{ kind: string; verificationStatus: string }>();
    const validKinds = new Set(
      beneficiaryDocuments.results
        .filter((item) => ["auto_verified", "verified"].includes(item.verificationStatus))
        .map((item) => item.kind),
    );
    const hasRejected = beneficiaryDocuments.results.some(
      (item) => item.verificationStatus === "rejected",
    );
    const beneficiaryStatus =
      validKinds.has("beneficiary_evidence") && validKinds.has("beneficiary_curp")
        ? "verified"
        : hasRejected
          ? "rejected"
          : "manual_review";
    await env.DB.prepare(
      "UPDATE beneficiaries SET document_status=?,document_reason=? WHERE id=?",
    )
      .bind(
        beneficiaryStatus,
        beneficiaryStatus === "verified"
          ? "Parentesco y CURP validados"
          : notes.trim() || "Falta validar parentesco o CURP",
        document.beneficiaryId,
      )
      .run();
  }
  const applicationDocuments = await env.DB.prepare(
    "SELECT verification_status AS verificationStatus FROM verification_documents WHERE application_id=?",
  )
    .bind(document.applicationId)
    .all<{ verificationStatus: string }>();
  const hasRejected = applicationDocuments.results.some(
    (item) => item.verificationStatus === "rejected",
  );
  const hasUnresolved = applicationDocuments.results.some(
    (item) => !["auto_verified", "verified"].includes(item.verificationStatus),
  );
  const applicationDocumentStatus = hasRejected
    ? "rejected"
    : hasUnresolved
      ? "manual_review"
      : "verified";
  await env.DB.prepare(
    `UPDATE applications SET document_status=?,
      status=CASE WHEN ?='rejected' THEN 'draft' ELSE status END,
      review_notes=CASE WHEN ?='rejected' THEN ? ELSE review_notes END,
      reviewed_at=CASE WHEN ?='rejected' THEN CURRENT_TIMESTAMP ELSE reviewed_at END
     WHERE id=?`,
  )
    .bind(
      applicationDocumentStatus,
      status,
      status,
      notes.trim() || null,
      status,
      document.applicationId,
    )
    .run();
  await audit(privilege.actor, `document.${status}`, "document", id, notes);
  return Response.json({
    ok: true,
    applicationDocumentStatus,
    applicationStatus: status === "rejected" ? "draft" : undefined,
  });
}
