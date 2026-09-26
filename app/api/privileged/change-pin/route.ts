import { env } from "cloudflare:workers";
import { getPrivilege } from "../../authz";
import { passwordValidationError } from "../../worker/password-crypto";
import { hashPrivilegedPin, verifyPrivilegedPin } from "../pin-crypto";

export async function POST(request: Request) {
  const privilege = await getPrivilege(request);
  if (!privilege)
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });
  const { currentPin = "", newPin = "" } = (await request.json()) as {
    currentPin?: string;
    newPin?: string;
  };
  const validationError = passwordValidationError(newPin);
  if (validationError)
    return Response.json({ error: validationError }, { status: 400 });
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
