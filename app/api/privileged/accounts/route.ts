import { env } from "cloudflare:workers";
import { requirePrivilege } from "../../authz";
import {
  createPrivilegedPinCredential,
  privilegedPinValidationError,
} from "../pin-crypto";

export async function GET(request: Request) {
  if (!(await requirePrivilege(request, "admin")))
    return Response.json({ error: "Acceso exclusivo para administración" }, { status: 403 });

  const accounts = await env.DB.prepare(
    "SELECT p.matricula,p.can_admin AS canAdmin,p.can_reader AS canReader,p.active,COALESCE(w.full_name,'Matrícula especial') AS fullName FROM privileged_accounts p LEFT JOIN workers w ON w.matricula=p.matricula WHERE p.can_reader=1 ORDER BY p.can_admin DESC,p.matricula",
  ).all<{
    matricula: string;
    canAdmin: number;
    canReader: number;
    active: number;
    fullName: string;
  }>();

  return Response.json({
    accounts: accounts.results.map((account) => ({
      ...account,
      canAdmin: Boolean(account.canAdmin),
      canReader: Boolean(account.canReader),
      active: Boolean(account.active),
    })),
  });
}

export async function POST(request: Request) {
  const manager = await requirePrivilege(request, "admin");
  if (!manager)
    return Response.json({ error: "Acceso exclusivo para administración" }, { status: 403 });

  const { matricula = "", pin = "" } = (await request.json()) as {
    matricula?: string;
    pin?: string;
  };
  const normalizedMatricula = matricula.replace(/\D/g, "");
  const normalizedPin = pin.replace(/\D/g, "");
  if (normalizedMatricula.length < 4 || normalizedMatricula.length > 12)
    return Response.json({ error: "Escribe una matrícula válida" }, { status: 400 });
  const pinError = privilegedPinValidationError(normalizedPin);
  if (pinError)
    return Response.json({ error: pinError }, { status: 400 });
  if (normalizedMatricula === manager.matricula)
    return Response.json({ error: "La matrícula maestra ya tiene acceso total" }, { status: 400 });

  const worker = await env.DB.prepare(
    "SELECT full_name AS fullName FROM workers WHERE matricula=? AND active=1",
  )
    .bind(normalizedMatricula)
    .first<{ fullName: string }>();
  if (!worker)
    return Response.json(
      { error: "La matrícula no aparece activa en el padrón" },
      { status: 404 },
    );

  const existing = await env.DB.prepare(
    "SELECT can_admin AS canAdmin FROM privileged_accounts WHERE matricula=?",
  )
    .bind(normalizedMatricula)
    .first<{ canAdmin: number }>();
  if (existing?.canAdmin)
    return Response.json(
      { error: "No se puede modificar otra matrícula administradora" },
      { status: 403 },
    );

  const credential = await createPrivilegedPinCredential(normalizedPin);
  await env.DB.prepare(
    `INSERT INTO privileged_accounts
      (matricula,pin_hash,pin_salt,pin_iterations,can_admin,can_reader,active)
     VALUES (?,?,?,?,0,1,1)
     ON CONFLICT(matricula) DO UPDATE SET
      pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,
      pin_iterations=excluded.pin_iterations,can_reader=1,active=1`,
  )
    .bind(
      normalizedMatricula,
      credential.pinHash,
      credential.pinSalt,
      credential.pinIterations,
    )
    .run();
  await env.DB.prepare("DELETE FROM privileged_sessions WHERE matricula=?")
    .bind(normalizedMatricula)
    .run();

  return Response.json({
    account: {
      matricula: normalizedMatricula,
      fullName: worker.fullName,
      canAdmin: false,
      canReader: true,
      active: true,
    },
  });
}

export async function PATCH(request: Request) {
  const manager = await requirePrivilege(request, "admin");
  if (!manager)
    return Response.json({ error: "Acceso exclusivo para administración" }, { status: 403 });

  const { matricula = "", active } = (await request.json()) as {
    matricula?: string;
    active?: boolean;
  };
  const normalizedMatricula = matricula.replace(/\D/g, "");
  if (!normalizedMatricula || typeof active !== "boolean")
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const target = await env.DB.prepare(
    "SELECT can_admin AS canAdmin FROM privileged_accounts WHERE matricula=? AND can_reader=1",
  )
    .bind(normalizedMatricula)
    .first<{ canAdmin: number }>();
  if (!target)
    return Response.json({ error: "Lector no encontrado" }, { status: 404 });
  if (target.canAdmin || normalizedMatricula === manager.matricula)
    return Response.json(
      { error: "La matrícula maestra no puede desactivarse" },
      { status: 403 },
    );

  await env.DB.batch([
    env.DB.prepare("UPDATE privileged_accounts SET active=? WHERE matricula=?").bind(
      active ? 1 : 0,
      normalizedMatricula,
    ),
    env.DB.prepare("DELETE FROM privileged_sessions WHERE matricula=?").bind(
      normalizedMatricula,
    ),
  ]);
  return Response.json({ ok: true, active });
}
