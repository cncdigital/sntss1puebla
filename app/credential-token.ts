const CREDENTIAL_TOKEN_PATTERN =
  /S1P[^A-Z0-9]?([TB])[^A-Z0-9]?([A-F0-9]{32})(?![A-Z0-9])/i;

export function cleanQrText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function decodeScannerText(value: string) {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Canonicaliza la lectura sin debilitar la validación del QR.
 *
 * Algunos lectores USB configurados como teclado inglés escriben los guiones
 * como apóstrofes u otro signo cuando Windows usa Español (Latinoamérica).
 * También pueden anteponer el identificador AIM (por ejemplo, ]Q3). Solo se
 * acepta como credencial una carga S1P con tipo T/B y 32 caracteres hexadecimales.
 */
export function normalizeCredentialToken(value: string) {
  const cleaned = cleanQrText(decodeScannerText(value)).toUpperCase();
  const match = cleaned.match(CREDENTIAL_TOKEN_PATTERN);
  return match ? `S1P-${match[1]}-${match[2]}` : cleaned;
}
