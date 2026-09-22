import { env } from "cloudflare:workers";
import { getCredentialValidity } from "../../credential-validity";
import { audit, requirePrivilege } from "../../authz";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type CandidateRow = {
  workerId: number;
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  curp: string | null;
  phone: string | null;
  applicationId: number | null;
  folio: string | null;
  status: string | null;
  documentStatus: string | null;
  adminValidated: number | null;
};

function normalizeMatricula(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

function credentialToken() {
  return `S1P-T-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

function applicationFolio() {
  return `S1P-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function findCandidate(matricula: string) {
  return env.DB.prepare(
    `SELECT w.id AS workerId,w.matricula,w.full_name AS fullName,w.unit,w.category,
      w.curp,w.phone,a.id AS applicationId,a.folio,a.status,
      a.document_status AS documentStatus,
      COALESCE(a.admin_validated,0) AS adminValidated
     FROM workers w
     LEFT JOIN applications a ON a.id=(
       SELECT latest.id FROM applications latest
       WHERE latest.worker_id=w.id AND latest.archived_at IS NULL
       ORDER BY latest.id DESC LIMIT 1
     )
     WHERE w.matricula=? AND w.active=1 LIMIT 1`,
  )
    .bind(matricula)
    .first<CandidateRow>();
}

async function describeCandidate(row: CandidateRow) {
  const validity = row.applicationId
    ? await getCredentialValidity(row.applicationId)
    : {
        valid: false,
        reason: "La matrícula todavía no tiene una credencial emitida.",
      };
  return {
    matricula: row.matricula,
    fullName: row.fullName,
    unit: row.unit,
    category: row.category,
    applicationId: row.applicationId,
    folio: row.folio,
    status: row.status || "none",
    documentStatus: row.documentStatus || "none",
    credentialValid: validity.valid,
    credentialValidationReason: validity.reason,
    adminValidated: Boolean(row.adminValidated),
    canValidate: !validity.valid,
  };
}

function invalidMatriculaResponse() {
  return Response.json(
    { error: "Escribe una matrícula válida de 4 a 12 dígitos." },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json(
      { error: "Esta función es exclusiva del perfil administrador." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const matricula = normalizeMatricula(
    new URL(request.url).searchParams.get("matricula"),
  );
  if (matricula.length < 4) return invalidMatriculaResponse();
  const candidate = await findCandidate(matricula);
  if (!candidate)
    return Response.json(
      { error: "La matrícula no existe o no está activa en el padrón." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  return Response.json(
    { candidate: await describeCandidate(candidate) },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json(
      { error: "Esta función es exclusiva del perfil administrador." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const payload = (await request.json().catch(() => null)) as {
    matricula?: string;
  } | null;
  const matricula = normalizeMatricula(payload?.matricula);
  if (matricula.length < 4) return invalidMatriculaResponse();
  let candidate = await findCandidate(matricula);
  if (!candidate)
    return Response.json(
      { error: "La matrícula no existe o no está activa en el padrón." },
      { status: 404, headers: NO_STORE_HEADERS },
    );

  if (candidate.applicationId) {
    const currentValidity = await getCredentialValidity(candidate.applicationId);
    if (currentValidity.valid)
      return Response.json(
        {
          ok: true,
          alreadyValid: true,
          message: "La credencial ya se encuentra válida; no fue necesario modificarla.",
          candidate: await describeCandidate(candidate),
        },
        { headers: NO_STORE_HEADERS },
      );
  }

  const note = `Validación administrativa por matrícula realizada por ${privilege.matricula}.`;
  let applicationId = candidate.applicationId;
  let created = false;
  if (applicationId) {
    await env.DB.prepare(
      `UPDATE applications SET status='approved',document_status='verified',
        credential_token=COALESCE(credential_token,?),
        profile_photo_key=COALESCE(profile_photo_key,(
          SELECT profile.storage_key FROM verification_documents profile
          WHERE profile.application_id=applications.id
            AND profile.beneficiary_id IS NULL AND profile.kind='profile_photo'
          ORDER BY profile.created_at DESC,profile.id DESC LIMIT 1
        )),
        review_notes=?,reviewed_at=CURRENT_TIMESTAMP,
        admin_validated=1,admin_validated_by=?,admin_validated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    )
      .bind(credentialToken(), note, privilege.actor, applicationId)
      .run();
  } else {
    const insertion = await env.DB.prepare(
      `INSERT INTO applications
        (worker_id,folio,status,credential_token,curp,phone,document_status,
         review_notes,reviewed_at,admin_validated,admin_validated_by,admin_validated_at)
       SELECT ?,?,'approved',?,?,?,'verified',?,CURRENT_TIMESTAMP,1,?,CURRENT_TIMESTAMP
       WHERE NOT EXISTS(
         SELECT 1 FROM applications concurrent_application
         WHERE concurrent_application.worker_id=?
       )`,
    )
      .bind(
        candidate.workerId,
        applicationFolio(),
        credentialToken(),
        candidate.curp,
        candidate.phone,
        note,
        privilege.actor,
        candidate.workerId,
      )
      .run();
    applicationId = Number(insertion.meta.last_row_id || 0) || null;
    created = Boolean(applicationId);
  }

  candidate = await findCandidate(matricula);
  applicationId ||= candidate?.applicationId || null;
  if (!candidate?.applicationId || !applicationId)
    return Response.json(
      { error: "No fue posible confirmar la credencial emitida." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  await audit(
    privilege.actor,
    "credential.admin_validated_by_matricula",
    "application",
    candidate.applicationId,
    `Matrícula ${matricula}; ${created ? "expediente administrativo creado" : "validación directa aplicada"}.`,
  );
  return Response.json(
    {
      ok: true,
      message: `Credencial de ${candidate.fullName} validada correctamente por matrícula.`,
      candidate: await describeCandidate(candidate),
    },
    { headers: NO_STORE_HEADERS },
  );
}
