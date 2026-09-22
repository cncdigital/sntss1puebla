export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";
// Keep Drive usable without forcing the sensitive Gmail scope through Google's
// verification flow. Approval notices have a manual, prefilled mail fallback.
export const GOOGLE_OAUTH_SCOPE = GOOGLE_DRIVE_SCOPE;
export const GOOGLE_DRIVE_ROOT_NAME = "Expedientes Credencial SNTSS1";

export function hasBroadDriveFolderAccess(
  permissions: Array<{ type?: string | null }> | null | undefined,
) {
  return Boolean(
    permissions?.some(
      (permission) =>
        permission.type === "anyone" || permission.type === "domain",
    ),
  );
}

export const DRIVE_DOCUMENT_FOLDERS = {
  ine: "01 INE",
  beneficiary_curp: "02 CURP",
  tarjeton: "03 Tarjetón",
  beneficiary_evidence: "04 Comprobantes de parentesco",
} as const;

export type DriveDocumentKind = keyof typeof DRIVE_DOCUMENT_FOLDERS;

export function normalizeGoogleOauthClientId(value: string) {
  return value.trim();
}

export function isValidGoogleOauthClientId(value: string) {
  const normalized = normalizeGoogleOauthClientId(value);
  return (
    normalized.length <= 320 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(normalized)
  );
}

export function isValidGoogleOauthClientSecret(value: string) {
  const normalized = value.trim();
  return (
    normalized.length >= 8 &&
    normalized.length <= 512 &&
    normalized === value &&
    !/\s/.test(normalized)
  );
}

export function maskedGoogleOauthClientId(value: string) {
  const normalized = normalizeGoogleOauthClientId(value);
  const suffix = ".apps.googleusercontent.com";
  const identifier = normalized.endsWith(suffix)
    ? normalized.slice(0, -suffix.length)
    : normalized;
  if (identifier.length <= 12) return `${identifier.slice(0, 3)}…${suffix}`;
  return `${identifier.slice(0, 8)}…${identifier.slice(-4)}${suffix}`;
}

export function safeDriveFileName(value: string) {
  const normalized = value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-140);
  return normalized || "documento.pdf";
}
