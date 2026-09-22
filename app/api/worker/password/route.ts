import { env } from "cloudflare:workers";
import { audit, getWorkerSession } from "../../authz";
import { getCredentialValidity } from "../../credential-validity";
import {
  constantTimeEqual,
  createPasswordSalt,
  derivePasswordHash,
  PASSWORD_ITERATIONS,
  passwordValidationError,
} from "../password-crypto";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type CredentialAccount = {
  applicationId: number;
  curp: string | null;
  email: string | null;
};

async function getCredentialAccount(workerId: number) {
  return env.DB.prepare(
    `SELECT a.id AS applicationId,COALESCE(a.curp,w.curp) AS curp,w.email
     FROM applications a JOIN workers w ON w.id=a.worker_id
     WHERE a.worker_id=? AND a.archived_at IS NULL ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(workerId)
    .first<CredentialAccount>();
}

export async function GET(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json(
      { error: "Inicia nuevamente con tu matrícula." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  const [account, password] = await Promise.all([
    getCredentialAccount(session.workerId),
    env.DB.prepare(
      "SELECT 1 AS configured FROM worker_passwords WHERE matricula=? LIMIT 1",
    )
      .bind(session.matricula)
      .first<{ configured: number }>(),
  ]);
  if (!account)
    return Response.json(
      {
        eligible: false,
        configured: Boolean(password),
        email: session.email,
        reason: "Primero completa tu expediente.",
      },
      { headers: NO_STORE_HEADERS },
    );
  const validity = await getCredentialValidity(account.applicationId);
  return Response.json(
    {
      eligible: validity.valid,
      configured: Boolean(password),
      email: account.email,
      reason: validity.valid
        ? "La credencial está validada y puede protegerse con contraseña."
        : validity.reason,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const session = await getWorkerSession(request);
  if (!session)
    return Response.json(
      { error: "Inicia nuevamente con tu matrícula." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  const {
    email = "",
    curp = "",
    password = "",
    confirmation = "",
    currentPassword = "",
  } = (await request.json()) as {
    email?: string;
    curp?: string;
    password?: string;
    confirmation?: string;
    currentPassword?: string;
  };
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCurp = curp.trim().toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return Response.json(
      { error: "Escribe un correo electrónico válido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  if (password !== confirmation)
    return Response.json(
      { error: "Las contraseñas no coinciden." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const validationError = passwordValidationError(password);
  if (validationError)
    return Response.json(
      { error: validationError },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const account = await getCredentialAccount(session.workerId);
  if (!account)
    return Response.json(
      { error: "Primero completa tu expediente." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const validity = await getCredentialValidity(account.applicationId);
  if (!validity.valid)
    return Response.json(
      { error: "La contraseña se habilita cuando la credencial sea válida." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  if (!account.curp || account.curp.trim().toUpperCase() !== normalizedCurp)
    return Response.json(
      { error: "La CURP no coincide con el expediente validado." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  if (account.email && account.email.trim().toLowerCase() !== normalizedEmail)
    return Response.json(
      { error: "El correo no coincide con el registrado en el expediente." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  const existing = await env.DB.prepare(
    `SELECT password_hash AS passwordHash,password_salt AS passwordSalt,
      iterations FROM worker_passwords WHERE matricula=?`,
  )
    .bind(session.matricula)
    .first<{
      passwordHash: string;
      passwordSalt: string;
      iterations: number;
    }>();
  if (existing) {
    if (!currentPassword)
      return Response.json(
        { error: "Escribe tu contraseña actual para cambiarla." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    const currentHash = await derivePasswordHash(
      currentPassword,
      existing.passwordSalt,
      existing.iterations,
    );
    if (!constantTimeEqual(currentHash, existing.passwordHash))
      return Response.json(
        { error: "La contraseña actual no es correcta." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
  }
  const salt = createPasswordSalt();
  const passwordHash = await derivePasswordHash(
    password,
    salt,
    PASSWORD_ITERATIONS,
  );
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO worker_passwords
        (matricula,password_hash,password_salt,iterations,failed_attempts,locked_until,updated_at)
       VALUES (?,?,?,?,0,NULL,CURRENT_TIMESTAMP)
       ON CONFLICT(matricula) DO UPDATE SET
         password_hash=excluded.password_hash,password_salt=excluded.password_salt,
         iterations=excluded.iterations,failed_attempts=0,locked_until=NULL,
         updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      session.matricula,
      passwordHash,
      salt,
      PASSWORD_ITERATIONS,
    ),
    env.DB.prepare(
      `UPDATE workers SET email=CASE WHEN email IS NULL OR trim(email)='' THEN ? ELSE email END,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).bind(normalizedEmail, session.workerId),
  ]);
  await audit(
    `matricula:${session.matricula}`,
    existing ? "worker.password_changed" : "worker.password_created",
    "worker",
    session.workerId,
  );
  return Response.json(
    {
      ok: true,
      configured: true,
      email: normalizedEmail,
      message: existing
        ? "Contraseña actualizada correctamente."
        : "Contraseña creada. Se solicitará en tu próximo acceso.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
