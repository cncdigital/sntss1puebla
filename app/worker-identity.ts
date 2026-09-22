export const CURP_PATTERN = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

export function normalizeMatricula(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}

export function normalizeAccessEmail(value: string) {
  return value.trim().toLocaleLowerCase("es-MX");
}

export function normalizeAccessCurp(value: string) {
  return value.trim().toUpperCase().replace(/\s/g, "");
}

export function validAccessEmail(value: string) {
  const normalized = normalizeAccessEmail(value);
  return (
    normalized.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  );
}

export function validAccessCurp(value: string) {
  return CURP_PATTERN.test(normalizeAccessCurp(value));
}

export function constantTimeTextEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1)
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export function identityDetailsMatch(input: {
  suppliedEmail: string;
  suppliedCurp: string;
  storedEmail: string | null;
  storedCurp: string | null;
}) {
  const suppliedEmail = normalizeAccessEmail(input.suppliedEmail);
  const suppliedCurp = normalizeAccessCurp(input.suppliedCurp);
  const storedEmail = normalizeAccessEmail(input.storedEmail || "");
  const storedCurp = normalizeAccessCurp(input.storedCurp || "");
  return {
    emailMatches:
      !storedEmail || constantTimeTextEqual(suppliedEmail, storedEmail),
    curpMatches:
      Boolean(storedCurp) && constantTimeTextEqual(suppliedCurp, storedCurp),
    canBindEmail: !storedEmail,
  };
}

export function maskedEmail(value: string) {
  const normalized = normalizeAccessEmail(value);
  const [local = "", domain = ""] = normalized.split("@", 2);
  if (!local || !domain) return "correo verificado";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function googleAccessActor(matricula: string) {
  return `worker-google:${normalizeMatricula(matricula)}`;
}

export function pendingGoogleAccessActor(matricula: string) {
  return `worker-google-verify:${normalizeMatricula(matricula)}`;
}

export function matriculaFromGoogleActor(
  actor: string,
  pending = false,
) {
  const prefix = pending ? "worker-google-verify:" : "worker-google:";
  if (!actor.startsWith(prefix)) return null;
  const matricula = actor.slice(prefix.length);
  return /^\d{4,12}$/.test(matricula) ? matricula : null;
}
