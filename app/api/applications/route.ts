import { env } from "cloudflare:workers";
import {
  audit,
  getWorkerSession,
  requirePrivilege,
} from "../authz";
import {
  queueTicketFromRequest,
  touchRegistrationSlot,
} from "../registration-capacity/shared";
import {
  recordCredentialConsent,
  validateCredentialConsent,
} from "../application-consent";
import type { CredentialConsentPayload } from "../../legal-config";
import { deleteStoredDocument } from "../google-drive/storage";

type BeneficiaryInput = {
  id?: number;
  clientReference?: string;
  fullName?: string;
  relationship?: string;
  curp?: string;
};

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const CURP_PATTERN = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

function credentialToken(kind: "T" | "B") {
  return `S1P-${kind}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const requestedStatus = new URL(request.url).searchParams.get("status") || "pending";
  const statusClause = requestedStatus === "all" ? "1=1" : "a.status=?";
  const query = env.DB.prepare(
    `SELECT a.id,a.folio,a.status,a.document_status AS documentStatus,
      a.review_notes AS reviewNotes,a.curp,a.phone,a.created_at AS createdAt,
      a.reviewed_at AS reviewedAt,
      COALESCE((SELECT MAX(vd.created_at) FROM verification_documents vd
        WHERE vd.application_id=a.id),a.created_at) AS lastDocumentAt,
      w.matricula,w.full_name AS fullName,w.unit,w.category,w.email
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE ${statusClause}
       AND a.archived_at IS NULL
       AND a.id=(
         SELECT latest.id FROM applications latest
         WHERE latest.worker_id=a.worker_id
           AND latest.archived_at IS NULL
         ORDER BY latest.id DESC LIMIT 1
       )
     ORDER BY CASE
       WHEN a.status='pending' THEN 0
       WHEN a.document_status='updating'
         OR a.review_notes LIKE 'Actualización documental%'
         OR a.review_notes LIKE 'Corrección documental%'
         OR a.review_notes LIKE 'Correcciones atendidas%'
         OR a.review_notes LIKE 'Revalidación%' THEN 0
       WHEN a.status='draft' AND a.reviewed_at IS NOT NULL AND EXISTS(
         SELECT 1 FROM verification_documents updated_document
         WHERE updated_document.application_id=a.id
           AND updated_document.created_at>a.reviewed_at
       ) THEN 0
       WHEN a.status<>'draft' AND EXISTS(
         SELECT 1 FROM verification_documents review_document
         WHERE review_document.application_id=a.id
           AND review_document.verification_status NOT IN ('auto_verified','verified')
       ) THEN 1
       ELSE 2
     END,
       lastDocumentAt DESC,a.id DESC LIMIT 300`,
  );
  const apps =
    requestedStatus === "all"
      ? await query.all<Record<string, unknown>>()
      : await query.bind(requestedStatus).all<Record<string, unknown>>();
  const ids = apps.results.map((item) => Number(item.id));
  if (!ids.length)
    return Response.json({ applications: [] }, { headers: NO_STORE_HEADERS });
  const placeholders = ids.map(() => "?").join(",");
  const family = await env.DB.prepare(
    `SELECT id,application_id AS applicationId,full_name AS fullName,
      relationship,curp,document_status AS documentStatus,document_reason AS documentReason
     FROM beneficiaries WHERE application_id IN (${placeholders}) ORDER BY id`,
  )
    .bind(...ids)
    .all<Record<string, unknown>>();
  const documents = await env.DB.prepare(
    `SELECT id,application_id AS applicationId,beneficiary_id AS beneficiaryId,kind,
      file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes,
      storage_provider AS storageProvider,
      verification_status AS verificationStatus,match_score AS matchScore,
      verification_reason AS verificationReason,reviewer_notes AS reviewerNotes,
      created_at AS createdAt
     FROM verification_documents WHERE application_id IN (${placeholders})
     ORDER BY created_at DESC,id DESC`,
  )
    .bind(...ids)
    .all<Record<string, unknown>>();
  return Response.json(
    {
      applications: apps.results.map((application) => {
        const applicationDocuments = documents.results.filter(
          (item) => Number(item.applicationId) === Number(application.id),
        );
        const unresolvedDocuments = applicationDocuments.filter(
          (item) =>
            !["auto_verified", "verified"].includes(
              String(item.verificationStatus),
            ),
        ).length;
        const status = String(application.status);
        const documentStatus = String(application.documentStatus || "");
        const reviewNotes = String(application.reviewNotes || "");
        const reviewedAt = String(application.reviewedAt || "");
        const hasDocumentsAfterReview =
          status === "draft" &&
          Boolean(reviewedAt) &&
          String(application.lastDocumentAt || "") > reviewedAt;
        const isDocumentUpdate =
          documentStatus === "updating" ||
          reviewNotes.startsWith("Actualización documental") ||
          reviewNotes.startsWith("Corrección documental") ||
          reviewNotes.startsWith("Correcciones atendidas") ||
          reviewNotes.startsWith("Revalidación") ||
          hasDocumentsAfterReview;
        return {
          ...application,
          isDocumentUpdate,
          needsReview:
            status === "pending" ||
            isDocumentUpdate ||
            (status !== "draft" && unresolvedDocuments > 0),
          unresolvedDocuments,
          beneficiaries: family.results.filter(
            (item) => Number(item.applicationId) === Number(application.id),
          ),
          documents: applicationDocuments.map((document, index) => ({
            ...document,
            isLatestUpload: index === 0,
          })),
        };
      }),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  const queueTicket = queueTicketFromRequest(request);
  if (!(await touchRegistrationSlot(session.matricula, queueTicket)))
    return Response.json(
      {
        error: "Necesitas un turno activo para enviar el expediente.",
        code: "REGISTRATION_SLOT_REQUIRED",
      },
      { status: 429 },
    );
  const payload = (await request.json()) as {
    curp?: string;
    email?: string;
    phone?: string;
    beneficiaries?: BeneficiaryInput[];
    reopenForUpdate?: boolean;
    consents?: CredentialConsentPayload;
  };
  const curp = payload.curp?.trim().toUpperCase() ?? "";
  if (!CURP_PATTERN.test(curp))
    return Response.json({ error: "La CURP no tiene un formato válido." }, { status: 400 });
  const contactEmail = payload.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    return Response.json(
      { error: "Escribe un correo electrónico válido." },
      { status: 400 },
    );
  const family = (payload.beneficiaries ?? []).slice(0, 12);
  for (const person of family) {
    if (!person.fullName?.trim() || !person.relationship?.trim())
      return Response.json({ error: "Completa los datos de cada beneficiario." }, { status: 400 });
    const familyCurp = person.curp?.trim().toUpperCase() ?? "";
    if (!CURP_PATTERN.test(familyCurp))
      return Response.json(
        { error: `Captura una CURP válida de 18 caracteres para ${person.fullName}.` },
        { status: 400 },
      );
  }
  const existing = await env.DB.prepare(
    `SELECT id,folio,status,document_status AS documentStatus,review_notes AS reviewNotes
     FROM applications WHERE worker_id=? AND archived_at IS NULL
       AND status IN ('draft','pending','approved','rejected')
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(session.workerId)
    .first<{
      id: number;
      folio: string;
      status: string;
      documentStatus: string;
      reviewNotes: string | null;
    }>();
  if (existing) {
    const currentFamilyCount = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM beneficiaries WHERE application_id=?",
    )
      .bind(existing.id)
      .first<{ total: number }>();
    const consentValidation = validateCredentialConsent(
      payload.consents,
      existing.status === "draft" || existing.status === "rejected"
        ? family.length > 0
        : family.length > 0 || Number(currentFamilyCount?.total || 0) > 0,
    );
    if (!consentValidation.ok)
      return Response.json({ error: consentValidation.error }, { status: 400 });
    if (existing.status === "rejected") {
      await env.DB.prepare(
        "UPDATE applications SET status='draft',reviewed_at=NULL WHERE id=?",
      )
        .bind(existing.id)
        .run();
      existing.status = "draft";
    }
    if (
      payload.reopenForUpdate &&
      ["pending", "approved"].includes(existing.status)
    ) {
      await env.DB.prepare(
        `UPDATE applications SET status='draft',document_status='updating',
          review_notes='Actualización documental iniciada por el titular.',
          reviewed_at=NULL WHERE id=?`,
      )
        .bind(existing.id)
        .run();
      await audit(
        `matricula:${session.matricula}`,
        "application.update_started",
        "application",
        existing.id,
        existing.status,
      );
      existing.status = "draft";
      existing.documentStatus = "updating";
      existing.reviewNotes = "Actualización documental iniciada por el titular.";
    } else if (
      payload.reopenForUpdate &&
      existing.status === "draft" &&
      (existing.documentStatus === "rejected" || Boolean(existing.reviewNotes))
    ) {
      await env.DB.prepare(
        `UPDATE applications SET document_status='updating',
          review_notes='Corrección documental iniciada por el titular.',
          reviewed_at=NULL WHERE id=?`,
      )
        .bind(existing.id)
        .run();
      existing.documentStatus = "updating";
      existing.reviewNotes = "Corrección documental iniciada por el titular.";
      await audit(
        `matricula:${session.matricula}`,
        "application.correction_started",
        "application",
        existing.id,
      );
    }
    const existingFamily = await env.DB.prepare(
      `SELECT id,client_reference AS clientReference
       FROM beneficiaries WHERE application_id=? ORDER BY id`,
    )
      .bind(existing.id)
      .all<{ id: number; clientReference: string | null }>();
    if (existing.status === "draft") {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE applications SET curp=?,phone=? WHERE id=?",
        ).bind(curp, payload.phone?.trim() || null, existing.id),
        env.DB.prepare(
          `UPDATE workers SET email=?,phone=?,updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        ).bind(
          contactEmail,
          payload.phone?.trim() || null,
          session.workerId,
        ),
      ]);
      const byId = new Map(existingFamily.results.map((person) => [person.id, person]));
      const byReference = new Map(
        existingFamily.results
          .filter((person) => person.clientReference)
          .map((person) => [person.clientReference!, person]),
      );
      const mappedFamily: Array<{ id: number; index: number }> = [];
      for (const [index, person] of family.entries()) {
        const reference = person.clientReference?.trim().slice(0, 80) || null;
        const current =
          (person.id ? byId.get(person.id) : undefined) ||
          (reference ? byReference.get(reference) : undefined);
        if (current) {
          await env.DB.prepare(
            `UPDATE beneficiaries SET full_name=?,relationship=?,curp=?,
              client_reference=COALESCE(client_reference,?) WHERE id=? AND application_id=?`,
          )
            .bind(
              person.fullName!.trim().toUpperCase(),
              person.relationship!.trim(),
              person.curp?.trim().toUpperCase() || null,
              reference,
              current.id,
              existing.id,
            )
            .run();
          mappedFamily.push({ id: current.id, index });
          continue;
        }
        const created = await env.DB.prepare(
          `INSERT INTO beneficiaries
            (application_id,client_reference,full_name,relationship,curp,active,document_status)
           VALUES (?,?,?,?,?,0,'incomplete') RETURNING id`,
        )
          .bind(
            existing.id,
            reference,
            person.fullName!.trim().toUpperCase(),
            person.relationship!.trim(),
            person.curp?.trim().toUpperCase() || null,
          )
          .first<{ id: number }>();
        if (created) mappedFamily.push({ id: created.id, index });
      }
      const keptIds = new Set(mappedFamily.map((person) => person.id));
      const removedFamily = existingFamily.results.filter((person) => !keptIds.has(person.id));
      for (const removed of removedFamily) {
        const storedDocuments = await env.DB.prepare(
          `SELECT storage_key AS storageKey,storage_provider AS storageProvider,
            drive_file_id AS driveFileId,legacy_storage_key AS legacyStorageKey
           FROM verification_documents WHERE application_id=? AND beneficiary_id=?`,
        )
          .bind(existing.id, removed.id)
          .all<{
            storageKey: string;
            storageProvider: string;
            driveFileId: string | null;
            legacyStorageKey: string | null;
          }>();
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM verification_documents WHERE application_id=? AND beneficiary_id=?",
          ).bind(existing.id, removed.id),
          env.DB.prepare(
            "DELETE FROM beneficiaries WHERE id=? AND application_id=?",
          ).bind(removed.id, existing.id),
        ]);
        await Promise.allSettled(
          storedDocuments.results.map((document) => deleteStoredDocument(document)),
        );
      }
      if (removedFamily.length)
        await audit(
          `matricula:${session.matricula}`,
          "beneficiary.removed",
          "application",
          existing.id,
          removedFamily.map((person) => person.id).join(","),
        );
      await recordCredentialConsent({
        db: env.DB,
        applicationId: existing.id,
        workerId: session.workerId,
        matricula: session.matricula,
        consent: payload.consents!,
        hasBeneficiaries: mappedFamily.length > 0,
      });
      return Response.json({
        applicationId: existing.id,
        folio: existing.folio,
        status: existing.status,
        beneficiaries: mappedFamily,
        duplicate: true,
      });
    }
    await recordCredentialConsent({
      db: env.DB,
      applicationId: existing.id,
      workerId: session.workerId,
      matricula: session.matricula,
      consent: payload.consents!,
      hasBeneficiaries: existingFamily.results.length > 0,
    });
    return Response.json(
      {
        applicationId: existing.id,
        folio: existing.folio,
        status: existing.status,
        beneficiaries: existingFamily.results.map((person, index) => ({
          id: person.id,
          index,
        })),
        duplicate: true,
      },
      { status: 200 },
    );
  }
  const consentValidation = validateCredentialConsent(
    payload.consents,
    family.length > 0,
  );
  if (!consentValidation.ok)
    return Response.json({ error: consentValidation.error }, { status: 400 });
  const folio = `S1P-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const application = await env.DB.prepare(
    `INSERT INTO applications
      (worker_id,folio,status,curp,phone,document_status)
     VALUES (?,?,'draft',?,?,'incomplete') RETURNING id`,
  )
    .bind(
      session.workerId,
      folio,
      curp,
      payload.phone?.trim() || null,
    )
    .first<{ id: number }>();
  if (!application)
    return Response.json({ error: "No fue posible crear el expediente." }, { status: 500 });
  await env.DB.prepare(
    `UPDATE workers SET email=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  )
    .bind(contactEmail, payload.phone?.trim() || null, session.workerId)
    .run();
  const createdFamily: Array<{ id: number; index: number }> = [];
  for (const [index, person] of family.entries()) {
    const row = await env.DB.prepare(
      `INSERT INTO beneficiaries
        (application_id,client_reference,full_name,relationship,curp,active,document_status)
       VALUES (?,?,?,?,?,0,'incomplete') RETURNING id`,
    )
      .bind(
        application.id,
        person.clientReference?.trim().slice(0, 80) || null,
        person.fullName!.trim().toUpperCase(),
        person.relationship!.trim(),
        person.curp?.trim().toUpperCase() || null,
      )
      .first<{ id: number }>();
    if (row) createdFamily.push({ id: row.id, index });
  }
  await recordCredentialConsent({
    db: env.DB,
    applicationId: application.id,
    workerId: session.workerId,
    matricula: session.matricula,
    consent: payload.consents!,
    hasBeneficiaries: createdFamily.length > 0,
  });
  await audit(`matricula:${session.matricula}`, "application.created", "application", application.id, folio);
  return Response.json(
    { applicationId: application.id, folio, beneficiaries: createdFamily },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const { id, status, notes = "" } = (await request.json()) as {
    id?: number;
    status?: "approved" | "rejected";
    notes?: string;
  };
  if (!id || !["approved", "rejected"].includes(status ?? ""))
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const application = await env.DB.prepare(
    `SELECT id,worker_id AS workerId,status,document_status AS documentStatus,
      review_notes AS reviewNotes,credential_token AS credentialToken,curp,phone,
      profile_photo_key AS profilePhotoKey,
      EXISTS(
        SELECT 1 FROM verification_documents updated_document
        WHERE updated_document.application_id=applications.id
          AND applications.reviewed_at IS NOT NULL
          AND updated_document.created_at>applications.reviewed_at
      ) AS hasDocumentsAfterReview
     FROM applications WHERE id=? AND archived_at IS NULL`,
  )
    .bind(id)
    .first<{
      id: number;
      workerId: number;
      status: string;
      documentStatus: string;
      reviewNotes: string | null;
      credentialToken: string | null;
      curp: string | null;
      phone: string | null;
      profilePhotoKey: string | null;
      hasDocumentsAfterReview: number;
    }>();
  if (!application)
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  const updateDraft =
    application.status === "draft" &&
    (application.documentStatus === "updating" ||
      application.reviewNotes?.startsWith("Actualización documental") ||
      application.reviewNotes?.startsWith("Corrección documental") ||
      application.reviewNotes?.startsWith("Correcciones atendidas") ||
      Boolean(application.hasDocumentsAfterReview));
  if (application.status !== "pending" && !updateDraft)
    return Response.json({ error: "La solicitud ya fue atendida." }, { status: 409 });
  if (status === "rejected") {
    await env.DB.prepare(
      `UPDATE applications SET status='draft',document_status='rejected',
        review_notes=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
    )
      .bind(notes.trim() || "Documentación no aprobada", id)
      .run();
    await audit(privilege.actor, "application.corrections_requested", "application", id, notes);
    return Response.json({ ok: true, status: "draft" });
  }
  const documents = await env.DB.prepare(
    `SELECT beneficiary_id AS beneficiaryId,kind,storage_key AS storageKey,
      verification_status AS verificationStatus
     FROM verification_documents WHERE application_id=?
     ORDER BY created_at DESC,id DESC`,
  )
    .bind(id)
    .all<{
      beneficiaryId: number | null;
      kind: string;
      storageKey: string;
      verificationStatus: string;
    }>();
  const validDocument = (kind: string, beneficiaryId: number | null = null) =>
    documents.results.find(
      (item) =>
        item.kind === kind &&
        item.beneficiaryId === beneficiaryId &&
        ["auto_verified", "verified"].includes(item.verificationStatus),
    );
  const profilePhoto = validDocument("profile_photo");
  const tarjeton = validDocument("tarjeton");
  const ine = validDocument("ine");
  const unresolved = documents.results.filter(
    (item) => !["auto_verified", "verified"].includes(item.verificationStatus),
  );
  const family = await env.DB.prepare(
    `SELECT id,full_name AS fullName,photo_key AS photoKey,
      document_status AS documentStatus,credential_token AS credentialToken
     FROM beneficiaries WHERE application_id=?`,
  )
    .bind(id)
    .all<{
      id: number;
      fullName: string;
      photoKey: string | null;
      documentStatus: string;
      credentialToken: string | null;
    }>();
  const familyDocuments = family.results.map((person) => ({
    person,
    photo: validDocument("beneficiary_photo", person.id),
    evidence: validDocument("beneficiary_evidence", person.id),
    curpDocument: validDocument("beneficiary_curp", person.id),
  }));
  const missing: string[] = [];
  if (!profilePhoto) missing.push("foto del titular");
  if (!tarjeton) missing.push("tarjetón del titular");
  if (!ine) missing.push("INE del titular");
  for (const item of familyDocuments) {
    if (!item.photo) missing.push(`foto de ${item.person.fullName}`);
    if (!item.evidence)
      missing.push(`documento de parentesco de ${item.person.fullName}`);
    if (!item.curpDocument)
      missing.push(`constancia CURP de ${item.person.fullName}`);
  }
  const labels: Record<string, string> = {
    profile_photo: "foto del titular",
    tarjeton: "tarjetón",
    ine: "INE",
    beneficiary_photo: "foto de beneficiario",
    beneficiary_evidence: "documento de parentesco",
    beneficiary_curp: "constancia CURP del beneficiario",
  };
  for (const document of unresolved) {
    const label = labels[document.kind] || document.kind.replaceAll("_", " ");
    if (!missing.includes(label)) missing.push(`${label} pendiente de validación`);
  }
  if (missing.length)
    return Response.json(
      {
        error: `No se puede aprobar todavía: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` y ${missing.length - 6} más` : ""}.`,
        missing,
      },
      { status: 409 },
    );
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE applications SET status='approved',document_status='verified',
        profile_photo_key=?,credential_token=COALESCE(credential_token,?),
        review_notes=?,reviewed_at=CURRENT_TIMESTAMP,
        admin_validated=0,admin_validated_by=NULL,admin_validated_at=NULL
       WHERE id=?`,
    ).bind(
      profilePhoto!.storageKey,
      credentialToken("T"),
      notes.trim() || null,
      id,
    ),
    ...familyDocuments.map((item) =>
      env.DB.prepare(
        `UPDATE beneficiaries SET photo_key=?,document_status='verified',
          document_reason='Foto, parentesco y CURP validados',active=1,
          credential_token=COALESCE(credential_token,?) WHERE id=?`,
      ).bind(
        item.photo!.storageKey,
        credentialToken("B"),
        item.person.id,
      ),
    ),
    env.DB.prepare(
      "UPDATE workers SET curp=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).bind(application.curp, application.phone, application.workerId),
  ]);
  await audit(privilege.actor, "application.approved", "application", id, notes);
  return Response.json({ ok: true, issued: family.results.length + 1 });
}
