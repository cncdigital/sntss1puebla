import {
  constantTimeEqual,
  createPasswordSalt,
  derivePasswordHash,
  PASSWORD_ITERATIONS,
} from "../worker/password-crypto.ts";

export type StoredPrivilegedPin = {
  pinHash: string;
  pinSalt: string | null;
  pinIterations: number | null;
};

export type PrivilegedPinCredential = {
  pinHash: string;
  pinSalt: string;
  pinIterations: number;
};

async function legacyPinHash(pin: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function privilegedPinValidationError(pin: string) {
  return /^\d{6,12}$/.test(pin)
    ? null
    : "La contraseña debe tener de 6 a 12 dígitos.";
}

export async function createPrivilegedPinCredential(
  pin: string,
): Promise<PrivilegedPinCredential> {
  const pinSalt = createPasswordSalt();
  return {
    pinHash: await derivePasswordHash(pin, pinSalt, PASSWORD_ITERATIONS),
    pinSalt,
    pinIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPrivilegedPin(
  pin: string,
  stored: StoredPrivilegedPin,
) {
  const hasModernMetadata = Boolean(stored.pinSalt || stored.pinIterations);
  if (hasModernMetadata) {
    if (
      !stored.pinSalt ||
      !Number.isInteger(stored.pinIterations) ||
      Number(stored.pinIterations) < 1 ||
      Number(stored.pinIterations) > PASSWORD_ITERATIONS
    )
      return { valid: false, needsUpgrade: false };
    const candidate = await derivePasswordHash(
      pin,
      stored.pinSalt,
      Number(stored.pinIterations),
    );
    return {
      valid: constantTimeEqual(candidate, stored.pinHash),
      needsUpgrade: false,
    };
  }

  const candidate = await legacyPinHash(pin);
  const valid = constantTimeEqual(candidate, stored.pinHash);
  return { valid, needsUpgrade: valid };
}
