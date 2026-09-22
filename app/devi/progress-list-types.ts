export const PROGRESS_PROCESS_OPTIONS = [
  { value: "nuevo_ingreso", label: "Nuevo ingreso" },
  { value: "cambio_rama", label: "Cambio de rama" },
  { value: "escalafon", label: "Escalafón" },
  { value: "cambio_adscripcion", label: "Cambio de adscripción (CAD)" },
  { value: "cambio_turno", label: "Cambio de turno (CAT)" },
  {
    value: "cambio_turno_adscripcion",
    label: "Cambios de adscripción y turno (CAD/CAT)",
  },
  { value: "cambio_area", label: "Cambio de área" },
  { value: "cambio_residencia", label: "Cambio de residencia" },
  { value: "cambio_tipo_plaza", label: "Cambio de tipo de plaza" },
  { value: "basificacion", label: "Lugares para basificación" },
  { value: "eventual", label: "Eventual" },
  { value: "plaza_08", label: "Plaza 08" },
  { value: "jornada", label: "Jornada" },
  { value: "ampliacion_jornada", label: "Ampliación de jornada" },
  { value: "aplicacion_jornada", label: "Aplicación de jornada" },
  { value: "clausula_97", label: "Cláusula 97" },
  { value: "dispensa_clausula_97", label: "Dispensa de Cláusula 97" },
  { value: "otro", label: "Otro listado" },
] as const;

export type ProgressProcessType =
  (typeof PROGRESS_PROCESS_OPTIONS)[number]["value"];

export function isProgressProcessType(
  value: unknown,
): value is ProgressProcessType {
  return PROGRESS_PROCESS_OPTIONS.some((option) => option.value === value);
}

export function progressProcessLabel(value: string, customLabel?: string | null) {
  if (value === "otro" && customLabel?.trim()) return customLabel.trim();
  return (
    PROGRESS_PROCESS_OPTIONS.find((option) => option.value === value)?.label ||
    "Listado progresivo"
  );
}

export type ProgressListFileInference = {
  processType: ProgressProcessType;
  title: string;
  referenceLabel: string;
};

function normalizedFileStem(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function referenceFromFileName(fileName: string) {
  const match = fileName.match(
    /(?:^|\D)(\d{1,2})[.\-_ ](\d{1,2})[.\-_ ](\d{2}|\d{4})(?:\D|$)/,
  );
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000)
    return "";
  return `Corte al ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function inferProgressListFile(
  fileName: string,
): ProgressListFileInference | null {
  const stem = normalizedFileStem(fileName);
  const referenceLabel = referenceFromFileName(fileName);
  const inferred: Omit<ProgressListFileInference, "referenceLabel"> | null =
    /^DISPENSA(?:S)?(?: DE)? CLAUSULA 97(?:\s|$)/.test(stem)
      ? {
          processType: "dispensa_clausula_97",
          title: "Dispensa de Cláusula 97",
        }
      : /^CLAUSULA 97(?:\s|$)/.test(stem)
        ? { processType: "clausula_97", title: "Cláusula 97" }
      : /^N I(?:\s|$)/.test(stem)
      ? { processType: "nuevo_ingreso", title: "Nuevo ingreso · lista general" }
      : /^C TIP PLAZA(?:\s|$)/.test(stem)
        ? {
            processType: "cambio_tipo_plaza",
            title: "Cambio de tipo de plaza · lista general",
          }
        : /^C RESI DIF ESTA(?:\s|$)/.test(stem)
          ? {
              processType: "cambio_residencia",
              title: "Cambio de residencia · diferente estado",
            }
          : /^C RES A PUE(?:\s|$)/.test(stem)
            ? {
                processType: "cambio_residencia",
                title: "Cambio de residencia · a Puebla",
              }
            : /^C RAMA(?:\s|$)/.test(stem)
              ? {
                  processType: "cambio_rama",
                  title: "Cambio de rama · lista general",
                }
              : /^C AREA(?:\s|$)/.test(stem)
                ? {
                    processType: "cambio_area",
                    title: "Cambio de área · lista general",
                  }
                : /^C ADS Y TURN(?:\s|$)/.test(stem)
                  ? {
                      processType: "cambio_turno_adscripcion",
                      title: "Cambios de adscripción y turno · lista general",
                    }
                  : /^AMP JOR(?:\s|$)/.test(stem)
                    ? {
                        processType: "ampliacion_jornada",
                        title: "Ampliación de jornada · lista general",
                      }
                    : null;
  return inferred ? { ...inferred, referenceLabel } : null;
}
