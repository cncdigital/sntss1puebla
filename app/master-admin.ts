export const MASTER_ADMIN_MATRICULAS = ["99222979", "9999"] as const;

const MASTER_ADMIN_SET = new Set<string>(MASTER_ADMIN_MATRICULAS);

export function isMasterAdministrator(matricula: string | null | undefined) {
  return MASTER_ADMIN_SET.has(String(matricula || "").replace(/\D/g, ""));
}
