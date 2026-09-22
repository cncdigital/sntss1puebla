import { env } from "cloudflare:workers";
import { getWorkerSession } from "../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json({ error: "Inicia nuevamente con tu matrícula." }, { status: 401 });
  await env.DB.prepare(
    `UPDATE applications SET status='draft'
     WHERE id=(
       SELECT a.id FROM applications a
       WHERE a.worker_id=? AND a.archived_at IS NULL AND (
         a.status='rejected' OR
         (a.status IN ('pending','approved') AND EXISTS(
           SELECT 1 FROM verification_documents d
           WHERE d.application_id=a.id AND d.verification_status='rejected'
         ))
       )
       ORDER BY a.id DESC LIMIT 1
     )`,
  )
    .bind(session.workerId)
    .run();
  const draft = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.folio,a.status,a.curp,a.phone,w.email,
      a.review_notes AS reviewNotes,
      CASE WHEN a.profile_photo_key IS NOT NULL THEN 1 ELSE 0 END AS profilePhotoAvailable
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE a.worker_id=? AND a.archived_at IS NULL AND a.status IN ('draft','pending','approved','rejected')
     ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(session.workerId)
    .first<{
      applicationId: number;
      folio: string;
      status: "draft" | "pending" | "approved" | "rejected";
      curp: string | null;
      email: string | null;
      phone: string | null;
      reviewNotes: string | null;
      profilePhotoAvailable: number;
    }>();
  if (!draft) return Response.json({ draft: null }, { headers: NO_STORE_HEADERS });
  const [family, documents] = await Promise.all([
    env.DB.prepare(
      `SELECT id,client_reference AS clientReference,full_name AS fullName,relationship,curp,
        CASE WHEN photo_key IS NOT NULL THEN 1 ELSE 0 END AS photoAvailable
       FROM beneficiaries WHERE application_id=? ORDER BY id`,
    )
      .bind(draft.applicationId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT beneficiary_id AS beneficiaryId,kind,file_name AS fileName,
        verification_status AS verificationStatus,
        verification_reason AS verificationReason,reviewer_notes AS reviewerNotes
       FROM verification_documents WHERE application_id=? ORDER BY id`,
    )
      .bind(draft.applicationId)
      .all<Record<string, unknown>>(),
  ]);
  return Response.json(
    {
      draft: {
        ...draft,
        beneficiaries: family.results,
        documents: documents.results,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}
