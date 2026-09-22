import { env } from "cloudflare:workers";
import {
  MAX_DOCUMENT_BYTES,
  allowedDocumentTypes,
  beneficiaryOwnerKey,
} from "./shared";
import { getWorkerSession } from "../authz";

type DraftApplication = { id: number; status: string };

async function latestApplication(matricula: string) {
  return env.DB.prepare(
    "SELECT a.id,a.status FROM applications a JOIN workers w ON w.id=a.worker_id WHERE w.matricula=? AND w.active=1 AND a.archived_at IS NULL ORDER BY a.id DESC LIMIT 1",
  )
    .bind(matricula)
    .first<DraftApplication>();
}

async function expectedBeneficiary(
  applicationId: number,
  ownerKey: string,
) {
  const family = await env.DB.prepare(
    "SELECT full_name AS fullName,relationship FROM beneficiaries WHERE application_id=? ORDER BY id",
  )
    .bind(applicationId)
    .all<{ fullName: string; relationship: string }>();
  return family.results.find(
    (person) =>
      beneficiaryOwnerKey(person.fullName, person.relationship) === ownerKey,
  );
}

export async function POST(request: Request) {
  const worker = await getWorkerSession(request);
  if (!worker)
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Carga de documento inválida" }, { status: 400 });
  }
  const matricula = worker.matricula;
  const ownerKey = String(form.get("ownerKey") ?? "");
  const documentType = String(form.get("documentType") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Selecciona el archivo PDF" }, { status: 400 });
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const signature = new TextDecoder().decode(
    await file.slice(0, 5).arrayBuffer(),
  );
  if (!looksLikePdf || signature !== "%PDF-")
    return Response.json({ error: "El documento debe estar en formato PDF" }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES)
    return Response.json(
      { error: "Cada PDF debe pesar máximo 700 KB" },
      { status: 413 },
    );

  const application = await latestApplication(matricula);
  if (!application)
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (application.status !== "draft")
    return Response.json(
      { error: "La solicitud no está habilitada para cargar documentos" },
      { status: 409 },
    );

  let validDocument = false;
  if (ownerKey === "titular")
    validDocument = ["ine", "tarjeton_pago"].includes(documentType);
  else {
    const beneficiary = await expectedBeneficiary(application.id, ownerKey);
    validDocument = Boolean(
      beneficiary &&
        allowedDocumentTypes(beneficiary.relationship).includes(documentType),
    );
  }
  if (!validDocument)
    return Response.json(
      { error: "El documento no corresponde al titular o beneficiario" },
      { status: 400 },
    );

  const previous = await env.DB.prepare(
    "SELECT id,storage_key AS storageKey FROM application_documents WHERE application_id=? AND owner_key=? AND document_type=?",
  )
    .bind(application.id, ownerKey, documentType)
    .first<{ id: number; storageKey: string }>();
  const storageKey = `application-documents/${application.id}/${crypto.randomUUID()}.pdf`;
  await env.BUCKET.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: "application/pdf",
      cacheControl: "private, no-store",
    },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO application_documents (application_id,owner_key,document_type,storage_key,file_name,content_type,size_bytes) VALUES (?,?,?,?,?,'application/pdf',?) ON CONFLICT(application_id,owner_key,document_type) DO UPDATE SET storage_key=excluded.storage_key,file_name=excluded.file_name,content_type=excluded.content_type,size_bytes=excluded.size_bytes,uploaded_at=CURRENT_TIMESTAMP",
    )
      .bind(
        application.id,
        ownerKey,
        documentType,
        storageKey,
        file.name.slice(0, 180),
        file.size,
      )
      .run();
  } catch (error) {
    await env.BUCKET.delete(storageKey);
    throw error;
  }
  if (previous?.storageKey) await env.BUCKET.delete(previous.storageKey);

  if (ownerKey !== "titular") {
    const obsolete = await env.DB.prepare(
      "SELECT id,storage_key AS storageKey FROM application_documents WHERE application_id=? AND owner_key=? AND document_type<>?",
    )
      .bind(application.id, ownerKey, documentType)
      .all<{ id: number; storageKey: string }>();
    if (obsolete.results.length) {
      await env.DB.batch(
        obsolete.results.map((document) =>
          env.DB.prepare("DELETE FROM application_documents WHERE id=?").bind(
            document.id,
          ),
        ),
      );
      await Promise.all(
        obsolete.results.map((document) =>
          env.BUCKET.delete(document.storageKey),
        ),
      );
    }
  }
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const worker = await getWorkerSession(request);
  if (!worker)
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });
  const normalizedMatricula = worker.matricula;
  const application = await latestApplication(normalizedMatricula);
  if (!application)
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (application.status !== "draft")
    return Response.json(
      { error: "La solicitud ya fue enviada a revisión" },
      { status: 409 },
    );

  const documents = await env.DB.prepare(
    "SELECT owner_key AS ownerKey,document_type AS documentType FROM application_documents WHERE application_id=?",
  )
    .bind(application.id)
    .all<{ ownerKey: string; documentType: string }>();
  const hasDocument = (ownerKey: string, documentTypes: string[]) =>
    documents.results.some(
      (document) =>
        document.ownerKey === ownerKey &&
        documentTypes.includes(document.documentType),
    );
  const missing: string[] = [];
  if (!hasDocument("titular", ["ine"])) missing.push("INE del titular");
  if (!hasDocument("titular", ["tarjeton_pago"]))
    missing.push("tarjetón de pago");
  const family = await env.DB.prepare(
    "SELECT full_name AS fullName,relationship FROM beneficiaries WHERE application_id=? ORDER BY id",
  )
    .bind(application.id)
    .all<{ fullName: string; relationship: string }>();
  for (const person of family.results) {
    const ownerKey = beneficiaryOwnerKey(person.fullName, person.relationship);
    if (!hasDocument(ownerKey, allowedDocumentTypes(person.relationship)))
      missing.push(`comprobante de ${person.fullName}`);
  }
  if (missing.length)
    return Response.json(
      { error: `Falta cargar: ${missing.join(", ")}` },
      { status: 400 },
    );

  await env.DB.prepare(
    "UPDATE applications SET status='pending',reviewed_at=NULL WHERE id=? AND status='draft'",
  )
    .bind(application.id)
    .run();
  return Response.json({ ok: true, status: "pending" });
}
