import { env } from "cloudflare:workers";
import { getPrivilege } from "../../authz";
import { passwordValidationError } from "../../worker/password-crypto";\nimport { hashPrivilegedPin, verifyPrivilegedPin } from "../pin-crypto";

export async function POST(request: Request) {
  const privilege = await getPrivilege(request);
  if (!privilege)
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });
  const { currentPin = "", newPin = "" } = (await request.json()) as {
    currentPin?: string;
    newPin?: string;
  };
  if (!/^\d{6,12}$/.test(newPin))
    return Response.json(
      { error: "La nueva contraseña debe tener de 6 a 12 dígitos." },
      { status: 400 },
    );
  const account = await env.DB.prepare(
    "SELECT pin_hash AS pinHash FROM privileged_accounts WHERE matricula=? AND active=1",
  )
    .bind(privilege.matricula)
    .first<{ pinHash: string }>();
  if (!account || !(await verifyPrivilegedPin(currentPin, account.pinHash)))
    return Response.json(
      { error: "La contraseña actual no es correcta." },
      { status: 403 },
    );
  await env.DB.prepare(
    "UPDATE privileged_accounts SET pin_hash=?,must_change_pin=0 WHERE matricula=?",
  )
    .bind(await hashPrivilegedPin(newPin), privilege.matricula)
    .run();
  return Response.json({ ok: true });
}
