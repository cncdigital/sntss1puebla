// Cloudflare Workers admite como máximo 100,000 iteraciones por operación PBKDF2.
const PASSWORD_ITERATIONS = 100_000;
const PRIVILEGED_PIN_PREFIX = "pbkdf2-sha256";
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const PBKDF2_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MIN_STORED_ITERATIONS = 50_000;
const MAX_STORED_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(bytes));
}

export function passwordValidationError(password: string) {
  if (password.length < 8 || password.length > 64)
    return "La contraseña debe tener entre 8 y 64 caracteres.";
  if (password.trim() !== password)
    return "La contraseña no debe comenzar ni terminar con espacios.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password))
    return "Incluye al menos una letra y un número.";
  return null;
}

export function createPasswordSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function derivePasswordHash(
  password: string,
  salt: string,
  iterations = PASSWORD_ITERATIONS,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function hashPrivilegedPin(pin: string) {
  const salt = createPasswordSalt();
  const hash = await derivePasswordHash(pin, salt, PASSWORD_ITERATIONS);
  return `${PRIVILEGED_PIN_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPrivilegedPin(pin: string, storedHash: string) {
  const stored = storedHash.trim();

  if (LEGACY_SHA256_PATTERN.test(stored)) {
    const candidate = await sha256Hex(pin);
    return {
      valid: constantTimeEqual(candidate, stored.toLowerCase()),
      needsUpgrade: true,
    };
  }

  const [prefix, iterationsText, salt, expectedHash, ...extra] =
    stored.split("$");
  const iterations = Number(iterationsText);
  if (
    extra.length ||
    prefix !== PRIVILEGED_PIN_PREFIX ||
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_STORED_ITERATIONS ||
    iterations > MAX_STORED_ITERATIONS ||
    !salt ||
    !PBKDF2_HASH_PATTERN.test(expectedHash || "")
  )
    return { valid: false, needsUpgrade: false };

  try {
    const candidate = await derivePasswordHash(pin, salt, iterations);
    return {
      valid: constantTimeEqual(candidate, expectedHash.toLowerCase()),
      needsUpgrade: iterations < PASSWORD_ITERATIONS,
    };
  } catch {
    return { valid: false, needsUpgrade: false };
  }
}

export { PASSWORD_ITERATIONS };
