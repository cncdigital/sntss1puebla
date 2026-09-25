import { sha256 } from "../reader/auth";
import {
  constantTimeEqual,
  createPasswordSalt,
  derivePasswordHash,
  PASSWORD_ITERATIONS,
} from "../worker/password-crypto";

const PBKDF2_PREFIX = "pbkdf2";

export async function hashPrivilegedPin(pin: string) {
  const salt = createPasswordSalt();
  const hash = await derivePasswordHash(pin, salt, PASSWORD_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPrivilegedPin(pin: string, stored: string) {
  if (stored.startsWith(`${PBKDF2_PREFIX}$`)) {
    const [, iterationText, salt, expected] = stored.split("$");
    const iterations = Number(iterationText);
    if (!Number.isInteger(iterations) || iterations < 100_000 || !salt || !expected)
      return false;
    const actual = await derivePasswordHash(pin, salt, iterations);
    return constantTimeEqual(actual, expected);
  }
  // One-time compatibility path for existing SHA-256 hashes. A successful
  // login is upgraded to PBKDF2 by the privileged session route.
  return constantTimeEqual(await sha256(pin), stored);
}

export function isLegacyPinHash(stored: string) {
  return !stored.startsWith(`${PBKDF2_PREFIX}$`);
}
