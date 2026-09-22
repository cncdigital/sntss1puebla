export const DEVI_CROSS_MATRICULA_LOOKUP = ["20010322"] as const;

const DEVI_CROSS_MATRICULA_LOOKUP_SET = new Set<string>(
  DEVI_CROSS_MATRICULA_LOOKUP,
);

export function canConsultOtherProgressMatriculas(
  accessMatricula: string | null | undefined,
  canAdmin = false,
  canManageActs = false,
) {
  if (canAdmin || canManageActs) return true;
  const normalized = String(accessMatricula || "").replace(/\D/g, "");
  return DEVI_CROSS_MATRICULA_LOOKUP_SET.has(normalized);
}

export function canCoachProgressLists(
  accessMatricula: string | null | undefined,
  canAdmin = false,
  canTrainDevi = false,
) {
  return (
    canAdmin ||
    canTrainDevi ||
    canConsultOtherProgressMatriculas(accessMatricula)
  );
}
