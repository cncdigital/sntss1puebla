import { env } from "cloudflare:workers";
import { getCredentialValidity } from "../../credential-validity";
import { audit, requirePrivilege } from "../../authz";
import {
  createPasswordSalt,
  derivePasswordHash,
  PASSWORD_ITERATIONS,
} from "../password-crypto";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

type ActiveCredentialRow = {
  applicationId: number;
  folio: string;
  matricula: string;
  fullName: string;
  category: string | null;
  curp: string | null;
  nss: string | null;
  email: string | null;
  profilePhotoKey: string | null;
  activeSince: string | null;
  passwordConfigured: number;
  beneficiaryCount: number;
  adminValidated: number;
  status: string;
  documentStatus: string;
};

export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "review");
  if (!privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const search = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) || "";
  const likeSearch = `%${search}%`;
  const credentials = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.folio,w.matricula,w.full_name AS fullName,
      w.category,COALESCE(a.curp,w.curp) AS curp,w.nss,w.email,
      COALESCE(a.profile_photo_key,
        (SELECT latest_photo.storage_key FROM verification_documents latest_photo
         WHERE latest_photo.application_id=a.id
           AND latest_photo.beneficiary_id IS NULL
           AND latest_photo.kind='profile_photo'
         ORDER BY latest_photo.created_at DESC,latest_photo.id DESC LIMIT 1)
      ) AS profilePhotoKey,
      a.reviewed_at AS activeSince,a.status,
      a.document_status AS documentStatus,
      COALESCE(a.admin_validated,0) AS adminValidated,
      EXISTS(
        SELECT 1 FROM worker_passwords password
        WHERE password.matricula=w.matricula
      ) AS passwordConfigured,
      (
        SELECT COUNT(*) FROM beneficiaries count_beneficiary
        WHERE count_beneficiary.application_id=a.id AND count_beneficiary.active=1
      ) AS beneficiaryCount
     FROM applications a
     JOIN workers w ON w.id=a.worker_id
     WHERE w.active=1
       AND a.archived_at IS NULL
       AND a.id=(
       SELECT latest.id FROM applications latest
       WHERE latest.worker_id=a.worker_id AND latest.archived_at IS NULL
       ORDER BY latest.id DESC LIMIT 1
     )
       AND (?='' OR w.matricula LIKE ? OR w.full_name LIKE ?)
     ORDER BY COALESCE(a.reviewed_at,a.created_at) DESC,a.id DESC LIMIT 500`,
  )
    .bind(search, likeSearch, likeSearch)
    .all<ActiveCredentialRow>();
  const ids = credentials.results.map((item) => item.applicationId);
  let beneficiaries: Array<{
    applicationId: number;
    fullName: string;
    relationship: string;
  }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const family = await env.DB.prepare(
      `SELECT application_id AS applicationId,full_name AS fullName,relationship
       FROM beneficiaries WHERE active=1 AND application_id IN (${placeholders})
       ORDER BY application_id,id`,
    )
      .bind(...ids)
      .all<{
        applicationId: number;
        fullName: string;
        relationship: string;
      }>();
    beneficiaries = family.results;
  }
  const describedCredentials = await Promise.all(
    credentials.results.map(async ({ profilePhotoKey, adminValidated, ...credential }) => {
      const validity = await getCredentialValidity(credential.applicationId);
      return {
        ...credential,
        photoUrl: profilePhotoKey
          ? `/api/application-photo?id=${credential.applicationId}`
          : null,
        passwordConfigured: Boolean(credential.passwordConfigured),
        adminValidated: Boolean(adminValidated),
        credentialCount: 1 + Number(credential.beneficiaryCount || 0),
        beneficiaries: beneficiaries.filter(
          (person) => person.applicationId === credential.applicationId,
        ),
        credentialValid: validity.valid,
        credentialValidationReason: validity.reason,
      };
    }),
  );
  describedCredentials.sort(
    (left, right) => Number(left.credentialValid) - Number(right.credentialValid),
  );
  return Response.json(
    { credentials: describedCredentials },
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
  const payload = (await request.json()) as {
    applicationId?: number;
    action?: "restart_validation" | "reset_password" | "issue_temporary_password";
    reason?: string;
  };
  if (
    !payload.applicationId ||
    !["restart_validation", "reset_password", "issue_temporary_password"].includes(payload.action || "")
  )
    return Response.json(
      { error: "Acción inválida." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const credential = await env.DB.prepare(
    `SELECT a.id AS applicationId,a.status,a.document_status AS documentStatus,
      w.id AS workerId,w.matricula,w.full_name AS fullName
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE a.id=? LIMIT 1`,
  )
    .bind(payload.applicationId)
    .first<{
      applicationId: number;
      status: string;
      documentStatus: string;
      workerId: number;
      matricula: string;
      fullName: string;
    }>();
  if (!credential)
    return Response.json(
      { error: "Credencial no encontrada." },
      { status: 404, headers: NO_STORE_HEADERS },
    );

  if (
    (payload.action === "reset_password" ||
      payload.action === "issue_temporary_password") &&
    !privilege.canAdmin
  )
    return Response.json(
      { error: "Solo un administrador puede entregar o restablecer contraseñas." },
      { status: 403, headers: NO_STORE_HEADERS },
    );

  if (payload.action === "issue_temporary_password") {
    if (credential.status !== "approved")
      return Response.json(
        { error: "La credencial no está aprobada." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    const validity = await getCredentialValidity(credential.applicationId);
    if (!validity.valid)
      return Response.json(
        { error: "Solo se puede entregar una contraseña temporal a una credencial válida." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    const temporaryPassword = generateTemporaryPassword();
    const salt = createPasswordSalt();
    const passwordHash = await derivePasswordHash(
      temporaryPassword,
      salt,
      PASSWORD_ITERATIONS,
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO worker_passwords
          (matricula,password_hash,password_salt,iterations,failed_attempts,locked_until,must_change_password,temporary_expires_at,updated_at)
         VALUES (?,?,?,?,0,NULL,1,datetime('now','+24 hours'),CURRENT_TIMESTAMP)
         ON CONFLICT(matricula) DO UPDATE SET
           password_hash=excluded.password_hash,password_salt=excluded.password_salt,
           iterations=excluded.iterations,failed_attempts=0,locked_until=NULL,
           must_change_password=1,temporary_expires_at=datetime('now','+24 hours'),
           updated_at=CURRENT_TIMESTAMP`,
      ).bind(
        credential.matricula,
        passwordHash,
        salt,
        PASSWORD_ITERATIONS,
      ),
      env.DB.prepare("DELETE FROM worker_sessions WHERE matricula=?").bind(
        credential.matricula,
      ),
    ]);
    await audit(
      privilege.actor,
      "worker.temporary_password_issued",
      "worker",
      credential.workerId,
      `Matrícula ${credential.matricula}; vigencia 24 horas`,
    );
    return Response.json(
      {
        ok: true,
        action: payload.action,
        temporaryPassword,
        expiresAt,
        message:
          "Contraseña temporal generada. Entrégala por un canal seguro; se mostrará una sola vez y deberá cambiarse al entrar.",
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  if (payload.action === "reset_password") {
    const password = await env.DB.prepare(
      "SELECT 1 AS configured FROM worker_passwords WHERE matricula=? LIMIT 1",
    )
      .bind(credential.matricula)
      .first<{ configured: number }>();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM worker_passwords WHERE matricula=?").bind(
        credential.matricula,
      ),
      env.DB.prepare("DELETE FROM worker_sessions WHERE matricula=?").bind(
        credential.matricula,
      ),
    ]);
    await audit(
      privilege.actor,
      "worker.password_reset_by_staff",
      "worker",
      credential.workerId,
      `Matrícula ${credential.matricula}; contraseña previa: ${password ? "sí" : "no"}`,
    );
    return Response.json(
      {
        ok: true,
        action: payload.action,
        message: password
          ? "Contraseña restablecida. El usuario podrá ingresar con su matrícula y crear una nueva cuando su credencial sea válida."
          : "La matrícula no tenía contraseña configurada; sus sesiones fueron cerradas por seguridad.",
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  const reason = payload.reason?.trim().slice(0, 300) || "Actualización de datos requerida";
  if (reason.length < 5)
    return Response.json(
      { error: "Escribe un motivo de al menos 5 caracteres." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (credential.status !== "approved")
    return Response.json(
      { error: "La credencial ya no está activa o se encuentra en revisión." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const reviewNote = `Revalidación solicitada por ${privilege.matricula}: ${reason}`;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE applications SET status='draft',document_status='revalidation',
        review_notes=?,reviewed_at=CURRENT_TIMESTAMP,
        admin_validated=0,admin_validated_by=NULL,admin_validated_at=NULL
       WHERE id=?`,
    ).bind(reviewNote, credential.applicationId),
    env.DB.prepare(
      `UPDATE verification_documents SET verification_status='manual_review',
        verification_reason='Revalidación integral solicitada por administrador o verificador.',
        reviewer_notes=NULL,reviewed_by=NULL,reviewed_at=NULL
       WHERE application_id=?`,
    ).bind(credential.applicationId),
    env.DB.prepare(
      `UPDATE beneficiaries SET active=0,document_status='manual_review',
        document_reason='Revalidación integral solicitada.' WHERE application_id=?`,
    ).bind(credential.applicationId),
  ]);
  await audit(
    privilege.actor,
    "credential.revalidation_requested",
    "application",
    credential.applicationId,
    `${credential.matricula}: ${reason}`,
  );
  return Response.json(
    {
      ok: true,
      action: payload.action,
      message:
        "La credencial quedó inactiva. El usuario verá el aviso para revisar sus datos y enviar nuevamente el expediente.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
