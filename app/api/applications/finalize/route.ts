import { env } from "cloudflare:workers";
import { audit, getWorkerSession } from "../../authz";
import {
  queueTicketFromRequest,
  touchRegistrationSlot,
} from "../../registration-capacity/shared";
import { hasCurrentCredentialConsent } from "../../application-consent";

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
  const { applicationId } = (await request.json()) as { applicationId?: number };
  if (!applicationId)
    return Response.json({ error: "Expediente inválido." }, { status: 400 });
  const application = await env.DB.prepare(
    `SELECT a.id,a.status,a.profile_photo_key AS profilePhotoKey,
      a.document_status AS documentStatus,a.review_notes AS reviewNotes
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE a.id=? AND w.matricula=? AND a.archived_at IS NULL`,
  )
    .bind(applicationId, session.matricula)
    .first<{
      id: number;
      status: string;
      profilePhotoKey: string | null;
      documentStatus: string;
      reviewNotes: string | null;
    }>();
  if (!application)
    return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
  if (application.status !== "draft")
    return Response.json({ ok: true, status: application.status });
  const documents = await env.DB.prepare(
    "SELECT beneficiary_id AS beneficiaryId,kind,verification_status AS verificationStatus FROM verification_documents WHERE application_id=?",
  )
    .bind(applicationId)
    .all<{
      beneficiaryId: number | null;
      kind: string;
      verificationStatus: string;
    }>();
  const titularKinds = new Set(
    documents.results.filter((item) => !item.beneficiaryId).map((item) => item.kind),
  );
  if (!application.profilePhotoKey || !titularKinds.has("tarjeton") || !titularKinds.has("ine"))
    return Response.json(
      { error: "Faltan la foto, el tarjetón o la INE del titular." },
      { status: 409 },
    );
  const family = await env.DB.prepare(
    "SELECT id,photo_key AS photoKey FROM beneficiaries WHERE application_id=?",
  )
    .bind(applicationId)
    .all<{ id: number; photoKey: string | null }>();
  if (!(await hasCurrentCredentialConsent(env.DB, applicationId, family.results.length > 0)))
    return Response.json(
      {
        error:
          "Falta la aceptación vigente del aviso de privacidad y las condiciones generales.",
      },
      { status: 409 },
    );
  for (const person of family.results) {
    const evidence = documents.results.find(
      (item) => item.beneficiaryId === person.id && item.kind === "beneficiary_evidence",
    );
    const curpDocument = documents.results.find(
      (item) => item.beneficiaryId === person.id && item.kind === "beneficiary_curp",
    );
    if (!person.photoKey || !evidence || !curpDocument)
      return Response.json(
        {
          error:
            "Cada beneficiario necesita foto, documento de parentesco y constancia CURP.",
        },
        { status: 409 },
      );
    const validated = [evidence, curpDocument].every((document) =>
      ["auto_verified", "verified"].includes(document.verificationStatus),
    );
    await env.DB.prepare(
      "UPDATE beneficiaries SET document_status=?,document_reason=? WHERE id=?",
    )
      .bind(
        validated ? "verified" : "manual_review",
        validated
          ? "Documento de parentesco y CURP validados"
          : "Parentesco o CURP pendientes de revisión humana",
        person.id,
      )
      .run();
  }
  const allAuto = documents.results.every((item) => item.verificationStatus === "auto_verified");
  const submissionNote =
    application.documentStatus === "revalidation" ||
    application.reviewNotes?.startsWith("Revalidación solicitada")
      ? "Revalidación de datos enviada por el titular."
      : application.documentStatus === "updating" ||
    application.reviewNotes?.startsWith("Actualización documental")
      ? "Actualización documental enviada por el titular."
      : application.reviewNotes
        ? "Correcciones atendidas; expediente reenviado por el titular."
        : null;
  await env.DB.prepare(
    `UPDATE applications SET status='pending',document_status=?,
      review_notes=?,reviewed_at=NULL WHERE id=?`,
  )
    .bind(
      allAuto ? "auto_verified" : "manual_review",
      submissionNote,
      applicationId,
    )
    .run();
  await audit(`matricula:${session.matricula}`, "application.submitted", "application", applicationId);
  return Response.json({
    ok: true,
    status: "pending",
    documentStatus: allAuto ? "auto_verified" : "manual_review",
    message: submissionNote
      ? `${submissionNote} Ya aparece en la bandeja del administrador para su aprobación.`
      : allAuto
        ? "Los nombres coincidieron automáticamente. El verificador dará la aprobación final."
        : "Uno o más PDF requieren revisión manual antes de emitir la credencial.",
  });
}
