import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../authz";
import { getCredentialValidity } from "../credential-validity";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matricula = url.searchParams.get("matricula")?.replace(/\D/g, "") ?? "";
  if (!matricula)
    return Response.json({ error: "Escribe tu matrícula" }, { status: 400 });
  const [workerSession, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  if (workerSession?.matricula !== matricula && !privilege)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const application = await env.DB.prepare(
    `SELECT a.id,a.folio,a.status,a.document_status AS documentStatus,
      a.review_notes AS reviewNotes,a.credential_token AS credentialToken,
      a.created_at AS createdAt,COALESCE(a.curp,w.curp) AS curp,
      COALESCE(a.profile_photo_key,
        (SELECT vd.storage_key FROM verification_documents vd
         WHERE vd.application_id=a.id AND vd.beneficiary_id IS NULL
           AND vd.kind='profile_photo'
         ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS profilePhotoKey,
      w.matricula,w.full_name AS fullName,w.unit,w.category,w.nss,w.email,
      EXISTS(SELECT 1 FROM worker_passwords wp WHERE wp.matricula=w.matricula) AS passwordConfigured,
      COALESCE((SELECT wp.must_change_password FROM worker_passwords wp WHERE wp.matricula=w.matricula),0) AS mustChangePassword,
      COALESCE(r.designation,'Trabajador/a IMSS') AS designation,
      COALESCE(r.credential_style,'standard') AS credentialStyle
     FROM applications a JOIN workers w ON w.id=a.worker_id
     LEFT JOIN role_assignments r ON r.matricula=w.matricula AND r.active=1
     WHERE w.matricula=? AND a.archived_at IS NULL ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(matricula)
    .first<{
      id: number;
      folio: string;
      status: "draft" | "pending" | "approved" | "rejected";
      documentStatus: string;
      reviewNotes: string | null;
      credentialToken: string | null;
      createdAt: string;
      curp: string | null;
      profilePhotoKey: string | null;
      matricula: string;
      fullName: string;
      unit: string | null;
      category: string | null;
      nss: string | null;
      email: string | null;
      passwordConfigured: number;
      mustChangePassword: number;
      designation: string;
      credentialStyle: string;
    }>();
  if (!application)
    return Response.json(
      { status: "none", folio: null, credentials: [] },
      { headers: NO_STORE_HEADERS },
    );
  if (application.status !== "approved")
    return Response.json(
      {
        status: application.status,
        folio: application.folio,
        documentStatus: application.documentStatus,
        reviewNotes: application.reviewNotes,
        createdAt: application.createdAt,
        credentials: [],
      },
      { headers: NO_STORE_HEADERS },
    );
  const credentialValidity = await getCredentialValidity(application.id);
  const family = await env.DB.prepare(
    `SELECT b.full_name AS fullName,b.relationship,b.curp,
      b.credential_token AS credentialToken,
      COALESCE(b.photo_key,
        (SELECT vd.storage_key FROM verification_documents vd
         WHERE vd.application_id=b.application_id AND vd.beneficiary_id=b.id
           AND vd.kind='beneficiary_photo'
         ORDER BY vd.created_at DESC,vd.id DESC LIMIT 1)) AS photoKey
     FROM beneficiaries b WHERE b.application_id=? AND b.active=1 ORDER BY b.id`,
  )
    .bind(application.id)
    .all<{
      fullName: string;
      relationship: string;
      curp: string | null;
      credentialToken: string;
      photoKey: string | null;
    }>();
  return Response.json(
    {
      status: "approved",
      folio: application.folio,
      documentStatus: application.documentStatus,
      credentialValid: credentialValidity.valid,
      credentialValidationReason: credentialValidity.reason,
      email: application.email,
      passwordConfigured: Boolean(application.passwordConfigured),
      mustChangePassword: Boolean(application.mustChangePassword),
      credentials: [
        {
          kind: "Titular",
          fullName: application.fullName,
          relationship: "Trabajador/a",
          designation: application.designation,
          credentialStyle: application.credentialStyle,
          matricula: application.matricula,
          curp: application.curp,
          unit: application.unit,
          category: application.category,
          nss: application.nss,
          credentialValid: credentialValidity.valid,
          credentialValidationReason: credentialValidity.reason,
          token: application.credentialToken,
          photoUrl:
            application.credentialToken && application.profilePhotoKey
              ? `/api/media?token=${encodeURIComponent(application.credentialToken)}`
              : null,
        },
        ...family.results.map((person) => ({
          kind: "Beneficiario",
          fullName: person.fullName,
          relationship: person.relationship,
          designation: person.relationship,
          credentialStyle: "standard",
          matricula: application.matricula,
          curp: person.curp,
          unit: application.unit,
          category: null,
          nss: null,
          credentialValid: credentialValidity.valid,
          credentialValidationReason: credentialValidity.reason,
          token: person.credentialToken,
          photoUrl:
            person.credentialToken && person.photoKey
              ? `/api/media?token=${encodeURIComponent(person.credentialToken)}`
              : null,
        })),
      ],
    },
    { headers: NO_STORE_HEADERS },
  );
}
