import { env } from "cloudflare:workers";
import { getPrivilege } from "../../authz";
import {
  createPrivilegedPinCredential,
  privilegedPinValidationError,
  verifyPrivilegedPin,
} from "../pin-crypto";

export async function POST(request: Request) {
  const privilege = await getPrivilege(request);
  if (!privilege)
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });
  const { currentPin = "", newPin = "" } = (await request.json()) as {
    currentPin?: string;
    newPin?: string;
  };
  const validationError = privilegedPinValidationError(newPin);
  if (validationError)
    return Response.json(
      { error: validationError },
      { status: 400 },
    );
  const account = await env.DB.prepare(
    `SELECT pin_hash AS pinHash,pin_salt AS pinSalt,
      pin_iterations AS pinIterations
     FROM privileged_accounts WHERE matricula=? AND active=1`,
  )
    .bind(privilege.matricula)
    .first<{
      pinHash: string;
      pinSalt: string | null;
      pinIterations: number | null;
    }>();
  const verification = account
    ? await verifyPrivilegedPin(currentPin, account)
    : { valid: false };
  if (!account || !verification.valid)
    return Response.json(
      { error: "La contraseña actual no es correcta." },
      { status: 403 },
    );
  const credential = await createPrivilegedPinCredential(newPin);
  await env.DB.prepare(
    `UPDATE privileged_accounts
     SET pin_hash=?,pin_salt=?,pin_iterations=?,must_change_pin=0
     WHERE matricula=?`,
  )
    .bind(
      credential.pinHash,
      credential.pinSalt,
      credential.pinIterations,
      privilege.matricula,
    )
    .run();
  return Response.json({ ok: true });
}
