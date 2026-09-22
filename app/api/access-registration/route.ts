import { env } from "cloudflare:workers";
import {
  recordCredentialConsent,
  validateCredentialConsent,
} from "../application-consent";
import { audit } from "../authz";
import {
  GoogleDriveStorageError,
  deleteStoredDocument,
  isGoogleDriveStorageActive,
  sha256Hex,
  uploadLegalDocumentToDrive,
} from "../google-drive/storage";
import type { CredentialConsentPayload } from "../../legal-config";
import {
  constantTimeTextEqual,
  normalizeAccessCurp,
  normalizeAccessEmail,
  normalizeMatricula,
  validAccessCurp,
  validAccessEmail,
} from "../../worker-identity";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};
const MAX_PDF_BYTES = 10 * 1024 * 1024;
type AccessDocumentKind = "tarjeton" | "ine";

type StoredAccessDocument = {
  storageKey: string;
  storageProvider: "r2" | "drive";
  driveFileId: string | null;
  driveFolderId: string | null;
  contentSha256: string | null;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-100);
}

async function validatedPdf(value: FormDataEntryValue | null, label: string) {
  if (!(value instanceof File) || !value.size)
    throw new Response(`${label}: selecciona un archivo PDF.`, { status: 400 });
  if (value.size > MAX_PDF_BYTES)
    throw new Response(`${label}: el archivo pesa más de 10 MB.`, {
      status: 413,
    });
  const isPdf =
    value.type === "application/pdf" || value.name.toLowerCase().endsWith(".pdf");
  const signature = new TextDecoder().decode(
    await value.slice(0, 5).arrayBuffer(),
  );
  if (!isPdf || signature !== "%PDF-")
    throw new Response(`${label}: el documento debe ser un PDF válido.`, {
      status: 400,
    });
  return value;
}

async function storeAccessDocument(input: {
  file: File;
  kind: AccessDocumentKind;
  matricula: string;
  applicationId: number;
  registrationId: number;
}): Promise<StoredAccessDocument> {
  const bytes = await input.file.arrayBuffer();
  const storageKey = `access-registrations/${input.registrationId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
  await env.BUCKET.put(storageKey, bytes, {
    httpMetadata: {
      contentType: "application/pdf",
      cacheControl: "private, no-store",
    },
    customMetadata: {
      matricula: input.matricula,
      kind: input.kind,
      registrationId: String(input.registrationId),
    },
  });
  const storedDocument: StoredAccessDocument = {
    storageKey,
    storageProvider: "r2",
    driveFileId: null,
    driveFolderId: null,
    contentSha256: await sha256Hex(bytes),
  };
  if (await isGoogleDriveStorageActive()) {
    try {
      const driveCopy = await uploadLegalDocumentToDrive({
        bytes,
        originalFileName: input.file.name,
        matricula: input.matricula,
        kind: input.kind,
        applicationId: input.applicationId,
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
        `matricula:${input.matricula}`,
        "google_drive.copy_deferred",
        "access_registration",
        input.registrationId,
        `${input.kind}:${code}`,
      ).catch(() => undefined);
    }
  }
  return storedDocument;
}

async function replaceAccessDocument(input: {
  registrationId: number;
  applicationId: number;
  matricula: string;
  kind: AccessDocumentKind;
  file: File;
}) {
  const previous = await env.DB.prepare(
    `SELECT storage_key AS storageKey,storage_provider AS storageProvider,
      drive_file_id AS driveFileId
     FROM worker_access_registration_documents
     WHERE registration_id=? AND kind=?`,
  )
    .bind(input.registrationId, input.kind)
    .first<{
      storageKey: string;
      storageProvider: string;
      driveFileId: string | null;
    }>();
  const stored = await storeAccessDocument(input);
  try {
    await env.DB.prepare(
      `INSERT INTO worker_access_registration_documents
        (registration_id,kind,storage_key,storage_provider,drive_file_id,
         drive_folder_id,content_sha256,file_name,mime_type,size_bytes,created_at)
       VALUES (?,?,?,?,?,?,?,?, 'application/pdf',?,CURRENT_TIMESTAMP)
       ON CONFLICT(registration_id,kind) DO UPDATE SET
         storage_key=excluded.storage_key,
         storage_provider=excluded.storage_provider,
         drive_file_id=excluded.drive_file_id,
         drive_folder_id=excluded.drive_folder_id,
         content_sha256=excluded.content_sha256,
         file_name=excluded.file_name,
         mime_type=excluded.mime_type,
         size_bytes=excluded.size_bytes,
         created_at=CURRENT_TIMESTAMP`,
    )
      .bind(
        input.registrationId,
        input.kind,
        stored.storageKey,
        stored.storageProvider,
        stored.driveFileId,
        stored.driveFolderId,
        stored.contentSha256,
        input.file.name.slice(0, 180),
        input.file.size,
      )
      .run();
  } catch (error) {
    await deleteStoredDocument(stored).catch(() => undefined);
    throw error;
  }
  if (previous?.storageKey && previous.storageKey !== stored.storageKey)
    await deleteStoredDocument(previous).catch(() => undefined);
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "No fue posible leer el formulario de registro." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const matricula = normalizeMatricula(String(form.get("matricula") || ""));
  const email = normalizeAccessEmail(String(form.get("email") || ""));
  const curp = normalizeAccessCurp(String(form.get("curp") || ""));
  const submissionId = String(form.get("submissionId") || "").trim();
  const consent: CredentialConsentPayload = {
    noticeVersion: String(form.get("noticeVersion") || ""),
    termsVersion: String(form.get("termsVersion") || ""),
    consentRecordVersion: String(form.get("consentRecordVersion") || ""),
    privacyNoticeAccepted: form.get("privacyNoticeAccepted") === "true",
    identificationDocumentsAccepted:
      form.get("identificationDocumentsAccepted") === "true",
    sensitiveDataAccepted: form.get("sensitiveDataAccepted") === "true",
    generalTermsAccepted: form.get("generalTermsAccepted") === "true",
    beneficiaryAuthorityConfirmed: false,
  };
  if (matricula.length < 4)
    return Response.json(
      { error: "Escribe una matrícula válida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (!validAccessEmail(email))
    return Response.json(
      { error: "Escribe un correo electrónico válido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (!validAccessCurp(curp))
    return Response.json(
      { error: "Escribe una CURP válida de 18 caracteres." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(submissionId))
    return Response.json(
      { error: "Reinicia el formulario para generar una solicitud segura." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const consentValidation = validateCredentialConsent(consent, false);
  if (!consentValidation.ok)
    return Response.json(
      { error: consentValidation.error },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  let tarjeton: File;
  let ine: File;
  try {
    [tarjeton, ine] = await Promise.all([
      validatedPdf(form.get("tarjeton"), "Tarjetón"),
      validatedPdf(form.get("ine"), "INE"),
    ]);
  } catch (error) {
    if (error instanceof Response)
      return Response.json(
        { error: await error.text() },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    throw error;
  }
  const worker = await env.DB.prepare(
    `SELECT id,matricula,full_name AS fullName,curp
     FROM workers WHERE matricula=? AND active=1`,
  )
    .bind(matricula)
    .first<{
      id: number;
      matricula: string;
      fullName: string;
      curp: string | null;
    }>();
  if (!worker)
    return Response.json(
      {
        error:
          "No fue posible confirmar la matrícula en el padrón activo. Solicita apoyo a Administración.",
      },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  const storedCurp = normalizeAccessCurp(worker.curp || "");
  if (storedCurp && !constantTimeTextEqual(storedCurp, curp))
    return Response.json(
      {
        error:
          "La CURP no coincide con el padrón. Un administrador debe corregir el dato antes de continuar.",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const previousRegistration = await env.DB.prepare(
    `SELECT id,status,email,curp,submission_id AS submissionId
     FROM worker_access_registrations WHERE worker_id=?`,
  )
    .bind(worker.id)
    .first<{
      id: number;
      status: string;
      email: string;
      curp: string;
      submissionId: string;
    }>();
  if (previousRegistration?.status === "approved")
    return Response.json(
      {
        error:
          "Tu acceso ya fue aprobado. Vuelve al inicio e ingresa con correo + CURP.",
        code: "ACCESS_ALREADY_APPROVED",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  if (previousRegistration?.status === "pending")
    return Response.json(
      {
        ok: true,
        status: "pending",
        duplicate: true,
        message:
          "Tu registro ya está en revisión. Vuelve al acceso más tarde; la app te indicará cuando ya puedas ingresar.",
      },
      { headers: NO_STORE_HEADERS },
    );
  if (
    previousRegistration?.status === "uploading" &&
    previousRegistration.submissionId !== submissionId &&
    (!constantTimeTextEqual(previousRegistration.email, email) ||
      !constantTimeTextEqual(previousRegistration.curp, curp))
  )
    return Response.json(
      {
        error:
          "Existe una carga reciente para esta matrícula. Intenta nuevamente con los mismos datos o solicita apoyo.",
      },
      { status: 409, headers: NO_STORE_HEADERS },
    );

  let application = await env.DB.prepare(
    `SELECT id,folio FROM applications WHERE worker_id=? AND archived_at IS NULL ORDER BY id DESC LIMIT 1`,
  )
    .bind(worker.id)
    .first<{ id: number; folio: string }>();
  if (!application) {
    const folio = `S1P-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    application = await env.DB.prepare(
      `INSERT INTO applications
        (worker_id,folio,status,curp,document_status)
       VALUES (?,?,'draft',?,'incomplete') RETURNING id,folio`,
    )
      .bind(worker.id, folio, curp)
      .first<{ id: number; folio: string }>();
  }
  if (!application)
    return Response.json(
      { error: "No fue posible preparar el expediente." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  const registration = await env.DB.prepare(
    `INSERT INTO worker_access_registrations
      (worker_id,application_id,email,curp,status,submission_id,review_notes,
       reviewed_by,reviewed_at,email_status,email_error,email_sent_at,
       created_at,updated_at)
     VALUES (?,?,?,?,'uploading',?,NULL,NULL,NULL,'pending',NULL,NULL,
       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(worker_id) DO UPDATE SET
       application_id=excluded.application_id,
       email=excluded.email,
       curp=excluded.curp,
       status='uploading',
       submission_id=excluded.submission_id,
       review_notes=NULL,
       reviewed_by=NULL,
       reviewed_at=NULL,
       email_status='pending',
       email_error=NULL,
       email_sent_at=NULL,
       updated_at=CURRENT_TIMESTAMP
     RETURNING id`,
  )
    .bind(worker.id, application.id, email, curp, submissionId)
    .first<{ id: number }>();
  if (!registration)
    return Response.json(
      { error: "No fue posible abrir la solicitud de acceso." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  try {
    await replaceAccessDocument({
      registrationId: registration.id,
      applicationId: application.id,
      matricula,
      kind: "tarjeton",
      file: tarjeton,
    });
    await replaceAccessDocument({
      registrationId: registration.id,
      applicationId: application.id,
      matricula,
      kind: "ine",
      file: ine,
    });
    await recordCredentialConsent({
      db: env.DB,
      applicationId: application.id,
      workerId: worker.id,
      matricula,
      consent,
      hasBeneficiaries: false,
      acceptanceChannel: "web_access_registration",
    });
    await env.DB.prepare(
      `UPDATE worker_access_registrations
       SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    )
      .bind(registration.id)
      .run();
    await audit(
      `access-registration:${matricula}`,
      "worker.access_registration_submitted",
      "worker_access_registration",
      registration.id,
      application.folio,
    );
    return Response.json(
      {
        ok: true,
        status: "pending",
        folio: application.folio,
        message:
          "Registro recibido. Administración revisará tu CURP, tarjetón e INE. Después podrás ingresar con tu correo y CURP.",
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("access-registration.upload-failed", error);
    if (error instanceof GoogleDriveStorageError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    return Response.json(
      {
        error:
          "No fue posible completar la carga. Tu avance quedó protegido; intenta nuevamente.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
