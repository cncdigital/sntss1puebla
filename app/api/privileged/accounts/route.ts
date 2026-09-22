import { env } from "cloudflare:workers";
import { sha256 } from "../../reader/auth";

function privilegedToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("sntss_privileged="))
      ?.slice(17) ?? ""
  );
}

async function requireSpecialAdmin(request: Request) {
  const token = privilegedToken(request);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT p.matricula FROM privileged_sessions s JOIN privileged_accounts p ON p.matricula=s.matricula WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP AND p.active=1 AND p.can_admin=1",
  )
    .bind(token)
    .first<{ matricula: string }>();
}

export async function GET(request: Request) {
  if (!(await requireSpecialAdmin(request)))
    return Response.json({ error: "Acceso exclusivo para matrícula maestra" }, { status: 403 });

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
  const manager = await requireSpecialAdmin(request);
  if (!manager)
    return Response.json({ error: "Acceso exclusivo para matrícula maestra" }, { status: 403 });

  const { matricula = "", pin = "" } = (await request.json()) as {
    matricula?: string;
    pin?: string;
  };
  const normalizedMatricula = matricula.replace(/\D/g, "");
  const normalizedPin = pin.replace(/\D/g, "");
  if (normalizedMatricula.length < 4 || normalizedMatricula.length > 12)
    return Response.json({ error: "Escribe una matrícula válida" }, { status: 400 });
  if (normalizedPin.length < 4 || normalizedPin.length > 8)
    return Response.json({ error: "El PIN debe tener de 4 a 8 números" }, { status: 400 });
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

  const pinHash = await sha256(normalizedPin);
  await env.DB.prepare(
    "INSERT INTO privileged_accounts (matricula,pin_hash,can_admin,can_reader,active) VALUES (?,?,0,1,1) ON CONFLICT(matricula) DO UPDATE SET pin_hash=excluded.pin_hash,can_reader=1,active=1",
  )
    .bind(normalizedMatricula, pinHash)
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
  const manager = await requireSpecialAdmin(request);
  if (!manager)
    return Response.json({ error: "Acceso exclusivo para matrícula maestra" }, { status: 403 });

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
