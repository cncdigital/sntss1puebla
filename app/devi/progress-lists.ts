import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";
import { releasePdfDocument } from "./pdf-lifecycle";
import type { ProgressProcessType } from "./progress-list-types";

export const MAX_PROGRESS_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PROGRESS_ROWS = 25_000;
export const MAX_PROGRESS_SHEETS = 40;
export const MAX_PROGRESS_PDF_PAGES = 350;
export const PROGRESS_LIST_ACCEPT = ".xlsx,.xls,.csv,.pdf";

export type ProgressEntryInput = {
  progressiveNumber: string;
  progressiveOrder: number;
  progressiveDerived: boolean;
  matricula: string;
  fullName: string;
  normalizedName: string;
  unitText: string | null;
  statusText: string | null;
  movementCode: "CAD" | "CAT" | null;
  categoryCode: string | null;
  categoryName: string | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
  calculatedPosition: number | null;
  sheetName: string;
  rowNumber: number;
};

export type ParsedProgressWorkbook = {
  entries: ProgressEntryInput[];
  sheetNames: string[];
  sheetsWithData: number;
  skippedRows: number;
  derivedSheets: string[];
};

export type ProgressLookupIntent = {
  isLookup: boolean;
  targetMatricula: string | null;
  processTypes: ProgressProcessType[];
};

const NAME_STOP_WORDS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y"]);

function plainCell(value: unknown, maxLength = 240) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeProgressText(value: unknown) {
  return plainCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeProgressName(value: unknown) {
  return plainCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeProgressMatricula(value: unknown) {
  const original = plainCell(value, 80).replace(/\s+/g, "");
  const integerLike = original.match(/^(\d+)(?:\.0+)?$/)?.[1];
  const digits = integerLike || original.replace(/\D/g, "");
  return /^\d{4,12}$/.test(digits) ? digits : "";
}

function normalizedHeader(value: unknown) {
  return normalizeProgressText(value)
    .replace(/\bnum\b/g, "numero")
    .replace(/\bno\b/g, "numero")
    .replace(/\bnro\b/g, "numero")
    .replace(/\bn\b/g, "numero")
    .replace(/\bcve\b/g, "clave")
    .replace(/\bgpo\b/g, "grupo")
    .replace(/\bcalif\b/g, "calificacion")
    .replace(/\s+/g, " ")
    .trim();
}

function matriculaHeader(value: string) {
  return /^(?:(?:numero|registro) (?:de )?)?(?:matricula|mat)(?: trabajador)?$|^registro trabajador$/.test(
    value,
  );
}

function nameHeader(value: string) {
  return /^nombre(?: s)?(?: completo| del trabajador| trabajador)?$|^(trabajador|aspirante|persona trabajadora)$/.test(
    value,
  );
}

function progressiveHeader(value: string) {
  return /^(progresivo|prog|numero|numero progresivo|numero de progresivo|numero prog|lugar|posicion|pos|orden|orden de prelacion|numero orden|numero de orden|lugar progresivo|folio)$/.test(
    value,
  );
}

function categoryCodeHeaderScore(value: string) {
  if (/^(?:clave|codigo) (?:de )?(?:categoria|puesto)(?: solicitad[ao])?$/.test(value)) return 6;
  if (/^(?:grupo|clave) (?:de )?calificacion(?: solicitada)?$/.test(value)) return 5;
  if (/^categoria codigo$/.test(value)) return 4;
  return -1;
}

function categoryNameHeaderScore(value: string) {
  if (/^(?:nombre|descripcion) (?:de )?categoria(?: solicitada)?$/.test(value)) return 6;
  if (/^categoria (?:solicitada|destino|requerida)$/.test(value)) return 5;
  if (/^categoria(?: del trabajador)?$/.test(value)) return 4;
  if (/^categoria actual$/.test(value)) return 3;
  if (/^(?:puesto|rama) solicitad[ao]$/.test(value)) return 3;
  return -1;
}

function assignmentHeaderScore(value: string) {
  if (/^(?:clave|codigo) (?:de )?adscripcion solicitada$/.test(value)) return 8;
  if (/^adscripcion (?:solicitada|destino|requerida)$/.test(value)) return 7;
  if (/^(?:destino|unidad destino|centro de trabajo destino)$/.test(value)) return 6;
  if (/^(?:clave|codigo) (?:de )?adscripcion$/.test(value)) return 5;
  if (/^adscripcion(?: del trabajador)?$/.test(value)) return 4;
  if (/^adscripcion actual$/.test(value)) return 3;
  if (/^(?:unidad|unidad medica|unidad de adscripcion|centro de trabajo|centro laboral)$/.test(value)) return 3;
  return -1;
}

function shiftHeaderScore(value: string) {
  if (/^(?:clave|codigo) (?:de )?turno solicitado$/.test(value)) return 7;
  if (/^turno (?:solicitado|destino|requerido)$/.test(value)) return 6;
  if (/^(?:clave|codigo) (?:de )?turno$/.test(value)) return 5;
  if (/^turno(?: del trabajador)?$/.test(value)) return 4;
  if (/^turno actual$/.test(value)) return 3;
  return -1;
}

function unitHeaderScore(value: string) {
  if (/^adscripcion(?: del trabajador)?$/.test(value)) return 6;
  if (/^(?:unidad|unidad medica|unidad de adscripcion|centro de trabajo)$/.test(value))
    return 5;
  return -1;
}

function statusHeaderScore(value: string) {
  if (/^estatus (?:de la |del )?(?:clausula|dispensa)(?: 97)?$/.test(value)) return 8;
  if (/^estatus(?: del tramite| de solicitud)?$/.test(value)) return 6;
  if (/^status(?: del tramite| de solicitud)?$/.test(value)) return 5;
  return -1;
}

type HeaderMatch = {
  rowIndex: number;
  matriculaIndex: number;
  nameIndex: number;
  progressiveIndex: number;
  categoryCodeIndex: number;
  categoryNameIndex: number;
  assignmentIndex: number;
  shiftIndex: number;
  unitIndex: number;
  statusIndex: number;
};

function findHeader(rows: unknown[][]): HeaderMatch | null {
  let best: (HeaderMatch & { score: number }) | null = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    let matriculaIndex = -1;
    let nameIndex = -1;
    let progressiveIndex = -1;
    let categoryCodeIndex = -1;
    let categoryCodeScore = -1;
    let categoryNameIndex = -1;
    let categoryNameScore = -1;
    let assignmentIndex = -1;
    let assignmentScore = -1;
    let shiftIndex = -1;
    let shiftScore = -1;
    let unitIndex = -1;
    let unitScore = -1;
    let statusIndex = -1;
    let statusScore = -1;
    row.forEach((cell, index) => {
      const header = normalizedHeader(cell);
      if (matriculaIndex < 0 && matriculaHeader(header)) matriculaIndex = index;
      if (nameIndex < 0 && nameHeader(header)) nameIndex = index;
      if (progressiveIndex < 0 && progressiveHeader(header)) progressiveIndex = index;
      const nextCategoryCodeScore = categoryCodeHeaderScore(header);
      if (nextCategoryCodeScore > categoryCodeScore) {
        categoryCodeIndex = index;
        categoryCodeScore = nextCategoryCodeScore;
      }
      const nextCategoryNameScore = categoryNameHeaderScore(header);
      if (nextCategoryNameScore > categoryNameScore) {
        categoryNameIndex = index;
        categoryNameScore = nextCategoryNameScore;
      }
      const nextAssignmentScore = assignmentHeaderScore(header);
      if (nextAssignmentScore > assignmentScore) {
        assignmentIndex = index;
        assignmentScore = nextAssignmentScore;
      }
      const nextShiftScore = shiftHeaderScore(header);
      if (nextShiftScore > shiftScore) {
        shiftIndex = index;
        shiftScore = nextShiftScore;
      }
      const nextUnitScore = unitHeaderScore(header);
      if (nextUnitScore > unitScore) {
        unitIndex = index;
        unitScore = nextUnitScore;
      }
      const nextStatusScore = statusHeaderScore(header);
      if (nextStatusScore > statusScore) {
        statusIndex = index;
        statusScore = nextStatusScore;
      }
    });
    if (matriculaIndex < 0 || nameIndex < 0) continue;
    const score =
      (progressiveIndex >= 0 ? 3 : 2) +
      [
        categoryCodeIndex,
        categoryNameIndex,
        assignmentIndex,
        shiftIndex,
        unitIndex,
        statusIndex,
      ].filter(
        (index) => index >= 0,
      ).length;
    if (!best || score > best.score)
      best = {
        rowIndex,
        matriculaIndex,
        nameIndex,
        progressiveIndex,
        categoryCodeIndex,
        categoryNameIndex,
        assignmentIndex,
        shiftIndex,
        unitIndex,
        statusIndex,
        score,
      };
  }
  if (!best) return null;
  return {
    rowIndex: best.rowIndex,
    matriculaIndex: best.matriculaIndex,
    nameIndex: best.nameIndex,
    progressiveIndex: best.progressiveIndex,
    categoryCodeIndex: best.categoryCodeIndex,
    categoryNameIndex: best.categoryNameIndex,
    assignmentIndex: best.assignmentIndex,
    shiftIndex: best.shiftIndex,
    unitIndex: best.unitIndex,
    statusIndex: best.statusIndex,
  };
}

function categoryParts(codeValue: unknown, nameValue: unknown) {
  const explicitCode = plainCell(codeValue, 80);
  const explicitName = plainCell(nameValue, 180);
  const combined = explicitName || explicitCode;
  const combinedMatch = combined.match(/^([A-Z0-9]{3,14})\s*[-–—:]\s*(.+)$/i);
  const categoryCode = plainCell(
    (explicitCode.match(/^([A-Z0-9]{3,14})(?:\s*[-–—:].*)?$/i)?.[1] ||
      combinedMatch?.[1]) ??
      "",
    80,
  ).toUpperCase();
  const categoryName = plainCell(
    explicitName
      ? combinedMatch?.[2] || explicitName
      : combinedMatch?.[2] || "",
    180,
  );
  return {
    categoryCode: categoryCode || null,
    categoryName: categoryName || null,
  };
}

function assignmentValue(value: unknown) {
  const text = plainCell(value, 120);
  if (!text) return null;
  const code = text.match(/\b(?=[A-Z0-9]{6,14}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/i)?.[0];
  return (code || text).toUpperCase();
}

function progressiveOrder(value: string, fallback: number) {
  const numeric = value.replace(/[,\s]/g, "").match(/\d+/)?.[0];
  const parsed = numeric ? Number.parseInt(numeric, 10) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseProgressWorkbook(bytes: Uint8Array): ParsedProgressWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellText: true,
      raw: false,
      codepage: 65001,
    });
  } catch {
    throw new Error(
      "No pude leer el Excel. Verifica que el archivo no esté dañado ni protegido.",
    );
  }
  if (!workbook.SheetNames.length)
    throw new Error("El archivo no contiene hojas para consultar.");
  if (workbook.SheetNames.length > MAX_PROGRESS_SHEETS)
    throw new Error(`El libro supera el máximo de ${MAX_PROGRESS_SHEETS} hojas.`);

  const entries: ProgressEntryInput[] = [];
  const sheetNames: string[] = [];
  const derivedSheets: string[] = [];
  let skippedRows = 0;
  let sheetsWithData = 0;

  for (const originalSheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[originalSheetName];
    const range = sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]!) : null;
    if (!sheet || !range) continue;
    if (range.e.r - range.s.r + 1 > 50_000 || range.e.c - range.s.c + 1 > 100)
      throw new Error(
        `La hoja "${plainCell(originalSheetName, 80)}" es demasiado grande para procesarla de forma segura.`,
      );
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const header = findHeader(rows);
    if (!header) continue;
    const sheetName = plainCell(originalSheetName, 160) || "Hoja";
    const progressiveDerived = header.progressiveIndex < 0;
    let validPosition = 0;
    let sheetEntries = 0;
    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (!row.some((cell) => plainCell(cell))) continue;
      const matricula = normalizeProgressMatricula(row[header.matriculaIndex]);
      const fullName = plainCell(row[header.nameIndex], 180);
      const normalizedName = normalizeProgressName(fullName);
      if (!matricula || normalizedName.length < 3) {
        skippedRows += 1;
        continue;
      }
      validPosition += 1;
      const providedProgressive = progressiveDerived
        ? ""
        : plainCell(row[header.progressiveIndex], 80);
      const rowProgressiveDerived = progressiveDerived || !providedProgressive;
      const progressiveNumber = providedProgressive || String(validPosition);
      const category = categoryParts(
        header.categoryCodeIndex >= 0 ? row[header.categoryCodeIndex] : "",
        header.categoryNameIndex >= 0 ? row[header.categoryNameIndex] : "",
      );
      entries.push({
        progressiveNumber,
        progressiveOrder: progressiveOrder(progressiveNumber, validPosition),
        progressiveDerived: rowProgressiveDerived,
        matricula,
        fullName,
        normalizedName,
        unitText:
          header.unitIndex >= 0
            ? plainCell(row[header.unitIndex], 160) || null
            : null,
        statusText:
          header.statusIndex >= 0
            ? plainCell(row[header.statusIndex], 240) || null
            : null,
        movementCode: null,
        categoryCode: category.categoryCode,
        categoryName: category.categoryName,
        requestedAssignmentCode:
          header.assignmentIndex >= 0
            ? assignmentValue(row[header.assignmentIndex])
            : null,
        requestedShift:
          header.shiftIndex >= 0
            ? plainCell(row[header.shiftIndex], 40) || null
            : null,
        calculatedPosition: null,
        sheetName,
        rowNumber: rowIndex + 1,
      });
      sheetEntries += 1;
      if (entries.length > MAX_PROGRESS_ROWS)
        throw new Error(
          `El archivo supera el máximo de ${MAX_PROGRESS_ROWS.toLocaleString("es-MX")} registros válidos.`,
        );
    }
    if (sheetEntries) {
      sheetsWithData += 1;
      sheetNames.push(sheetName);
      if (progressiveDerived) derivedSheets.push(sheetName);
    }
  }

  if (!entries.length)
    throw new Error(
      "No encontré registros válidos. Cada hoja debe incluir columnas de Matrícula y Nombre; Progresivo es recomendable y, si falta, se usará el orden de las filas.",
    );
  assignCalculatedPositions(entries);
  return { entries, sheetNames, sheetsWithData, skippedRows, derivedSheets };
}

type PdfColumn = "progressive" | "matricula" | "name";

type PdfProgressCandidate = {
  progressiveNumber: string;
  progressiveDerived: boolean;
  matricula: string;
  fullName: string;
  movementCode: "CAD" | "CAT" | null;
  requestedAssignmentCode: string | null;
  requestedShift: string | null;
};

function pdfHeaderOrder(lines: string[]): PdfColumn[] | null {
  for (const line of lines.slice(0, 80)) {
    const normalized = normalizeProgressText(line);
    const positions: Array<{ column: PdfColumn; index: number }> = [
      {
        column: "progressive",
        index: normalized.search(
          /\b(?:numero progresivo|progresivo|lugar|posicion|orden de prelacion|orden)\b/,
        ),
      },
      { column: "matricula", index: normalized.search(/\bmatricula\b/) },
      {
        column: "name",
        index: normalized.search(/\bnombre(?: completo| del trabajador)?\b/),
      },
    ].filter((item) => item.index >= 0);
    if (
      !positions.some((item) => item.column === "matricula") ||
      !positions.some((item) => item.column === "name")
    )
      continue;
    return positions
      .sort((left, right) => left.index - right.index)
      .map((item) => item.column);
  }
  return null;
}

function looksLikePdfName(value: string) {
  const normalized = normalizeProgressName(value);
  if (!normalized || !/[A-Z]/.test(normalized)) return false;
  if (
    /\b(?:MATRICULA|NUMERO PROGRESIVO|PROGRESIVO|NOMBRE DEL TRABAJADOR|LISTADO|PAGINA|INSTITUTO MEXICANO|SINDICATO NACIONAL|FECHA DE CORTE|TOTAL DE REGISTROS)\b/.test(
      normalized,
    )
  )
    return false;
  const tokens = normalized
    .split(" ")
    .filter((token) => /[A-Z]/.test(token) && !NAME_STOP_WORDS.has(token));
  return tokens.length >= 2;
}

function pdfCandidate(
  progressive: string | null,
  matriculaValue: string,
  nameValue: string,
  movementCode: "CAD" | "CAT" | null = null,
  requestedAssignmentCode: string | null = null,
  requestedShift: string | null = null,
): PdfProgressCandidate | null {
  const matricula = normalizeProgressMatricula(matriculaValue);
  if (/\d{4,12}/.test(nameValue)) return null;
  const fullName = plainCell(nameValue, 180)
    .replace(/^[\s,;:|/\\-]+|[\s,;:|/\\-]+$/g, "")
    .trim();
  if (!matricula || !looksLikePdfName(fullName)) return null;
  const progressiveNumber = plainCell(progressive, 80).replace(/\D/g, "");
  if (progressive !== null && !progressiveNumber) return null;
  return {
    progressiveNumber,
    progressiveDerived: progressive === null,
    matricula,
    fullName,
    movementCode,
    requestedAssignmentCode,
    requestedShift,
  };
}

function pdfDateToken(value: string) {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(
    value.replace(/^[,;:]+|[,;:]+$/g, ""),
  );
}

function pdfNameToken(value: string) {
  if (/\d/.test(value)) return false;
  const normalized = normalizeProgressName(value);
  return /[A-Z]/.test(normalized) && !/^(?:M|F)$/.test(normalized);
}

function officialSiapPdfCandidate(line: string): PdfProgressCandidate | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  const progressive = tokens[0]?.replace(/[.)-]+$/, "") || "";
  if (!/^\d{1,7}$/.test(progressive)) return null;
  const movementCode = /^(?:CAD|CAT)$/i.test(tokens[1] || "")
    ? (tokens[1].toUpperCase() as "CAD" | "CAT")
    : null;
  const requestedAssignmentCode =
    movementCode && /^[A-Z0-9]{6,14}$/i.test(tokens[2] || "")
      ? tokens[2].toUpperCase()
      : null;
  const combinedShift =
    movementCode &&
    tokens[3] &&
    tokens[4] &&
    !pdfDateToken(tokens[4]) &&
    progressShiftKind(`${tokens[3]} ${tokens[4]}`) === "jornada_acumulada"
      ? `${tokens[3]} ${tokens[4]}`
      : null;
  const requestedShift =
    combinedShift ||
    (movementCode && tokens[3] && !pdfDateToken(tokens[3])
      ? plainCell(tokens[3], 40)
      : null);
  const dateIndex = tokens.findIndex(pdfDateToken);
  if (dateIndex < 2) return null;
  const requestTokens = tokens.slice(1, dateIndex);
  const genericAssignmentCode = requestTokens.find((token) =>
    /^(?=[A-Z0-9]{6,14}$)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+$/i.test(
      token,
    ),
  );
  const genericShift = requestTokens.find((token) =>
    /^(?:mat|matutino|ves|vespertino|noc|nocturno|mov|movil|jacum|jornada[ _-]?acumulada)$/i.test(
      token,
    ),
  );
  const resolvedAssignmentCode =
    requestedAssignmentCode || genericAssignmentCode?.toUpperCase() || null;
  const resolvedShift = requestedShift || (genericShift ? plainCell(genericShift, 40) : null);

  const matriculaBeforeDate = tokens[dateIndex - 1];
  if (/^\d{4,12}$/.test(matriculaBeforeDate)) {
    const candidate = pdfCandidate(
      progressive,
      matriculaBeforeDate,
      tokens.slice(1, dateIndex - 1).join(" "),
      movementCode,
      resolvedAssignmentCode,
      resolvedShift,
    );
    if (candidate) return candidate;
  }

  for (let index = dateIndex + 1; index < tokens.length - 1; index += 1) {
    if (!/^\d{4,12}$/.test(tokens[index])) continue;
    const nameTokens: string[] = [];
    for (let nameIndex = index + 1; nameIndex < tokens.length; nameIndex += 1) {
      const token = tokens[nameIndex];
      if (/^(?:M|F)$/i.test(token)) break;
      if (!pdfNameToken(token)) break;
      nameTokens.push(token);
    }
    const candidate = pdfCandidate(
      progressive,
      tokens[index],
      nameTokens.join(" "),
      movementCode,
      resolvedAssignmentCode,
      resolvedShift,
    );
    if (candidate) return candidate;
  }
  return null;
}

function parsePdfCandidateLine(
  value: string,
  headerOrder: PdfColumn[] | null,
  officialOnly = false,
): PdfProgressCandidate | null {
  const line = plainCell(value, 520)
    .replace(/[|;\t]+/g, " ")
    .replace(/^(\d{1,7})[.)-]\s+/, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;

  const officialCandidate = officialSiapPdfCandidate(line);
  if (officialCandidate) return officialCandidate;
  if (officialOnly) return null;

  const patterns: Array<{
    order: string;
    expression: RegExp;
    build: (match: RegExpMatchArray) => PdfProgressCandidate | null;
  }> = [
    {
      order: "progressive,matricula,name",
      expression: /^(\d{1,7})\s+(\d{4,12})\s+(.+)$/,
      build: (match) => pdfCandidate(match[1], match[2], match[3]),
    },
    {
      order: "matricula,progressive,name",
      expression: /^(\d{4,12})\s+(\d{1,7})\s+(.+)$/,
      build: (match) => pdfCandidate(match[2], match[1], match[3]),
    },
    {
      order: "matricula,name,progressive",
      expression: /^(\d{4,12})\s+(.+?)\s+(\d{1,7})$/,
      build: (match) => pdfCandidate(match[3], match[1], match[2]),
    },
    {
      order: "name,matricula,progressive",
      expression: /^(.+?)\s+(\d{4,12})\s+(\d{1,7})$/,
      build: (match) => pdfCandidate(match[3], match[2], match[1]),
    },
    {
      order: "progressive,name,matricula",
      expression: /^(\d{1,7})\s+(.+?)\s+(\d{4,12})$/,
      build: (match) => pdfCandidate(match[1], match[3], match[2]),
    },
    {
      order: "name,progressive,matricula",
      expression: /^(.+?)\s+(\d{1,7})\s+(\d{4,12})$/,
      build: (match) => pdfCandidate(match[2], match[3], match[1]),
    },
  ];
  const preferredOrder = headerOrder?.join(",") || "";
  const orderedPatterns = preferredOrder
    ? [...patterns].sort((left, right) =>
        left.order === preferredOrder ? -1 : right.order === preferredOrder ? 1 : 0,
      )
    : patterns;
  for (const pattern of orderedPatterns) {
    const match = line.match(pattern.expression);
    const candidate = match ? pattern.build(match) : null;
    if (candidate) return candidate;
  }

  const matriculaFirst = line.match(/^(\d{4,12})\s+(.+)$/);
  if (matriculaFirst) {
    const candidate = pdfCandidate(null, matriculaFirst[1], matriculaFirst[2]);
    if (candidate) return candidate;
  }
  const matriculaLast = line.match(/^(.+?)\s+(\d{4,12})$/);
  return matriculaLast
    ? pdfCandidate(null, matriculaLast[2], matriculaLast[1])
    : null;
}

function cleanPdfLines(pageText: string) {
  return String(pageText || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => plainCell(line, 520))
    .filter(Boolean);
}

function numericPdfCell(value: string) {
  return /^\d{1,12}$/.test(value.replace(/[.)-]+$/, "").trim());
}

function officialSiapPage(lines: string[]) {
  const heading = normalizeProgressText(lines.slice(0, 10).join(" "));
  return (
    heading.includes("cambio solicitado situacion actual") ||
    (heading.includes("no prog nombre matricula") &&
      heading.includes("registro"))
  );
}

function looksLikePdfDataRow(value: string) {
  return (
    /^\d{1,7}(?:[.)-])?\s+/.test(value) &&
    /\d{4,12}/.test(value) &&
    /[A-Za-zÁÉÍÓÚÑÜ]/i.test(value)
  );
}

function pdfCategoryHeading(value: string) {
  const match = plainCell(value, 240).match(/^(\d{6})\s*-\s*(.+)$/);
  if (!match) return null;
  const name = plainCell(match[2], 180);
  return name ? { code: match[1], name } : null;
}

export type ProgressShiftKind =
  | "matutino"
  | "vespertino"
  | "nocturno"
  | "jornada_acumulada"
  | "movil";

export function progressShiftKind(value: string | null): ProgressShiftKind | string | null {
  const normalized = normalizeProgressText(value).replace(/\s+/g, "");
  if (!normalized) return null;
  if (/^(?:mat|matut|matutino|manana)$/.test(normalized)) return "matutino";
  if (/^(?:ves|vesp|vespertino)$/.test(normalized)) return "vespertino";
  if (/^(?:noc|noct|nocturno)$/.test(normalized)) return "nocturno";
  if (
    /^(?:ja|jacum|jacumulada|acum|acumulada|jornadaacum|jornadaacumulada)$/.test(
      normalized,
    ) ||
    normalized.includes("jornadaacumulada")
  )
    return "jornada_acumulada";
  if (/^(?:mov|movil)$/.test(normalized)) return "movil";
  return normalizeProgressText(value).replace(/\s+/g, "_") || null;
}

export function cadQueueKind(value: string | null) {
  return progressShiftKind(value);
}

export function catQueueKind(value: string | null) {
  return progressShiftKind(value);
}

export type ProgressPositionEntry = Pick<
  ProgressEntryInput,
  | "matricula"
  | "movementCode"
  | "categoryCode"
  | "categoryName"
  | "requestedAssignmentCode"
  | "requestedShift"
  | "calculatedPosition"
>;

export function assignCalculatedPositions<T extends ProgressPositionEntry>(entries: T[]) {
  const queues = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    let queueKey: string;
    if (entry.movementCode === "CAD" || entry.movementCode === "CAT") {
      if (!entry.categoryCode || !entry.requestedAssignmentCode) continue;
      const queueKind = progressShiftKind(entry.requestedShift);
      if (!queueKind) continue;
      queueKey = [
        entry.movementCode,
        normalizeProgressText(entry.categoryCode),
        normalizeProgressText(entry.requestedAssignmentCode),
        queueKind,
      ].join("|");
    } else {
      const categoryKey = normalizeProgressText(
        entry.categoryCode || entry.categoryName || "sin categoria",
      );
      const assignmentKey = normalizeProgressText(
        entry.requestedAssignmentCode || "sin adscripcion",
      );
      const shiftKey = progressShiftKind(entry.requestedShift) || "sin turno";
      queueKey = ["LISTA", categoryKey, assignmentKey, shiftKey].join("|");
    }
    let people = queues.get(queueKey);
    if (!people) {
      people = new Map<string, number>();
      queues.set(queueKey, people);
    }
    let position = people.get(entry.matricula);
    if (!position) {
      position = people.size + 1;
      people.set(entry.matricula, position);
    }
    entry.calculatedPosition = position;
  }
}

export function parseProgressPdfPages(pageTexts: string[]): ParsedProgressWorkbook {
  if (!pageTexts.length) throw new Error("El PDF no contiene páginas para consultar.");
  if (pageTexts.length > MAX_PROGRESS_PDF_PAGES)
    throw new Error(
      `El PDF supera el máximo de ${MAX_PROGRESS_PDF_PAGES} páginas. Divídelo en archivos más pequeños.`,
    );

  const entries: ProgressEntryInput[] = [];
  const sheetNames: string[] = [];
  const derivedSheets: string[] = [];
  let skippedRows = 0;
  let validPosition = 0;
  let currentCategoryCode: string | null = null;
  let currentCategoryName: string | null = null;
  const officialDocument = pageTexts.some((pageText) =>
    officialSiapPage(cleanPdfLines(pageText)),
  );

  pageTexts.forEach((pageText, pageIndex) => {
    const lines = cleanPdfLines(pageText);
    const headerOrder = pdfHeaderOrder(lines);
    const officialPage = officialDocument || officialSiapPage(lines);
    const pageName = `Página ${pageIndex + 1}`;
    let pageEntries = 0;
    let pageHasDerived = false;
    for (let lineIndex = 0; lineIndex < lines.length; ) {
      const category = pdfCategoryHeading(lines[lineIndex]);
      if (category) {
        currentCategoryCode = category.code;
        currentCategoryName = category.name;
        lineIndex += 1;
        continue;
      }
      let candidate = parsePdfCandidateLine(
        lines[lineIndex],
        headerOrder,
        officialPage,
      );
      let consumed = candidate ? 1 : 0;
      if (!candidate) {
        for (const width of officialPage ? [2, 3] : [3, 2]) {
          const parts = lines.slice(lineIndex, lineIndex + width);
          if (
            parts.length !== width ||
            (!officialPage && !parts.some(numericPdfCell)) ||
            (officialPage &&
              (!/^\d{1,7}(?:[.)-])?\s+/.test(parts[0]) ||
                !parts[0].split(/\s+/).some(pdfDateToken))) ||
            (officialPage &&
              parts
                .slice(1)
                .some(
                  (part) =>
                    /^\d{1,7}(?:[.)-])?\s+/.test(part) &&
                    part.split(/\s+/).some(pdfDateToken),
                )) ||
            parts.some((part) => /\b(?:MATR[IÍ]CULA|PROGRESIVO)\b/i.test(part))
          )
            continue;
          candidate = parsePdfCandidateLine(
            parts.join(" "),
            headerOrder,
            officialPage,
          );
          if (candidate) {
            consumed = width;
            break;
          }
        }
      }
      if (!candidate) {
        if (
          officialPage
            ? /^\d{1,7}(?:[.)-])?\s+/.test(lines[lineIndex]) &&
              lines[lineIndex].split(/\s+/).some(pdfDateToken)
            : looksLikePdfDataRow(lines[lineIndex])
        )
          skippedRows += 1;
        lineIndex += 1;
        continue;
      }

      validPosition += 1;
      const progressiveNumber = candidate.progressiveNumber || String(validPosition);
      entries.push({
        progressiveNumber,
        progressiveOrder: progressiveOrder(progressiveNumber, validPosition),
        progressiveDerived: candidate.progressiveDerived,
        matricula: candidate.matricula,
        fullName: candidate.fullName,
        normalizedName: normalizeProgressName(candidate.fullName),
        unitText: null,
        statusText: null,
        movementCode: candidate.movementCode,
        categoryCode: currentCategoryCode,
        categoryName: currentCategoryName,
        requestedAssignmentCode: candidate.requestedAssignmentCode,
        requestedShift: candidate.requestedShift,
        calculatedPosition: null,
        sheetName: pageName,
        rowNumber: lineIndex + 1,
      });
      pageEntries += 1;
      pageHasDerived ||= candidate.progressiveDerived;
      if (entries.length > MAX_PROGRESS_ROWS)
        throw new Error(
          `El archivo supera el máximo de ${MAX_PROGRESS_ROWS.toLocaleString("es-MX")} registros válidos.`,
        );
      lineIndex += Math.max(consumed, 1);
    }
    if (pageEntries) {
      sheetNames.push(pageName);
      if (pageHasDerived) derivedSheets.push(pageName);
    }
  });

  if (!entries.length)
    throw new Error(
      "No encontré registros válidos en el PDF. Debe contener texto seleccionable y filas con Matrícula y Nombre; Progresivo es recomendable y, si falta, se usará el orden de aparición.",
    );
  assignCalculatedPositions(entries);
  return {
    entries,
    sheetNames,
    sheetsWithData: sheetNames.length,
    skippedRows,
    derivedSheets,
  };
}

async function parseProgressPdf(bytes: Uint8Array): Promise<ParsedProgressWorkbook> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new Error(
      "No pude leer el PDF. Verifica que el archivo no esté dañado, cifrado o protegido.",
    );
  }
  try {
    if (pdf.numPages > MAX_PROGRESS_PDF_PAGES)
      throw new Error(
        `El PDF supera el máximo de ${MAX_PROGRESS_PDF_PAGES} páginas. Divídelo en archivos más pequeños.`,
      );
    const result = await extractText(pdf, { mergePages: false });
    const pages = result.text.map((pageText) => String(pageText || ""));
    if (pages.join("").replace(/\s/g, "").length < 20)
      throw new Error(
        "El PDF no contiene texto seleccionable. Convierte primero el documento escaneado con OCR o sube el listado en Excel o CSV.",
      );
    return parseProgressPdfPages(pages);
  } finally {
    await releasePdfDocument(pdf);
  }
}

export async function parseProgressDocument(
  bytes: Uint8Array,
  fileName: string,
): Promise<ParsedProgressWorkbook> {
  return /\.pdf$/i.test(fileName)
    ? parseProgressPdf(bytes)
    : parseProgressWorkbook(bytes);
}

function meaningfulNameTokens(value: string) {
  return Array.from(
    new Set(
      normalizeProgressName(value)
        .split(" ")
        .filter((token) => token.length >= 2 && !NAME_STOP_WORDS.has(token)),
    ),
  );
}

export function progressNamesMatch(profileName: string, listName: string) {
  const profile = normalizeProgressName(profileName);
  const listed = normalizeProgressName(listName);
  if (!profile || !listed) return false;
  if (profile === listed) return true;
  const profileTokens = meaningfulNameTokens(profile);
  const listedTokens = meaningfulNameTokens(listed);
  if (Math.min(profileTokens.length, listedTokens.length) < 2) return false;
  const overlap = profileTokens.filter((token) => listedTokens.includes(token)).length;
  return overlap >= 2 && overlap / Math.min(profileTokens.length, listedTokens.length) >= 0.8;
}

function processTypesInQuestion(normalized: string): ProgressProcessType[] {
  const matches: ProgressProcessType[] = [];
  if (/\bnuevo(?:s)? ingreso(?:s)?\b/.test(normalized))
    matches.push("nuevo_ingreso");
  if (/\bcambio (?:de )?rama\b|\brama.*\bcambio\b/.test(normalized))
    matches.push("cambio_rama");
  if (/\bescalafon/.test(normalized)) matches.push("escalafon");
  if (/\bcambio (?:de )?adscripcion\b|\badscripcion\b|\bcad\b/.test(normalized))
    matches.push("cambio_adscripcion");
  if (
    /\bcambio (?:de )?turno\b|\bturno.*\blista\b|\badscripcion.*\bturno\b|\bcat\b/.test(
      normalized,
    )
  )
    matches.push("cambio_turno");
  if (/\bcambio (?:de )?area\b/.test(normalized)) matches.push("cambio_area");
  if (/\bcambio (?:de )?residencia\b/.test(normalized))
    matches.push("cambio_residencia");
  if (/\bcambio (?:de )?tipo (?:de )?plaza\b|\btipo (?:de )?plaza\b/.test(normalized))
    matches.push("cambio_tipo_plaza");
  if (/\b(?:basificacion|basicacion|baseificacion)\b|\blugar(?:es)? (?:de |para )?base\b/.test(normalized))
    matches.push("basificacion");
  if (/\beventual(?:es)?\b/.test(normalized)) matches.push("eventual");
  if (/\bplaza (?:0?8|cero ocho)\b|\b08\b/.test(normalized)) matches.push("plaza_08");
  if (/\bdispensa(?: de la| de)? clausula 97\b/.test(normalized))
    matches.push("dispensa_clausula_97");
  else if (/\bclausula 97\b/.test(normalized))
    matches.push("clausula_97");
  if (/\bampliacion (?:de |para )?(?:la )?jornada\b/.test(normalized))
    matches.push("ampliacion_jornada");
  else if (/\baplicacion (?:de |para )?(?:la )?jornada\b/.test(normalized))
    matches.push("aplicacion_jornada");
  else if (/\bjornada\b/.test(normalized))
    matches.push("jornada", "ampliacion_jornada", "aplicacion_jornada");
  return Array.from(new Set(matches));
}

export function detectProgressLookupIntent(message: string): ProgressLookupIntent {
  const normalized = normalizeProgressText(message);
  const processTypes = processTypesInQuestion(normalized);
  if (
    !processTypes.length &&
    /\b(?:estatus|status|estado)(?: de | del | de la )?(?:mi )?(?:solicitud|tramite)?\b/.test(
      normalized,
    )
  )
    processTypes.push("clausula_97", "dispensa_clausula_97");
  const explicitLookup = /\b(numero (?:de |en )?(?:la )?lista|numero progresivo|progresivo|en que lugar|que lugar|cual es mi lugar|lugar (?:de |para )?base|lugar en (?:la|el) lista|posicion en (?:la|el) lista|puesto en (?:la|el) lista|en que numero|como voy en (?:la|el) lista|estatus|status|estado (?:de |del )?(?:mi )?(?:solicitud|tramite|clausula|dispensa))\b/.test(
    normalized,
  );
  const targetMatricula =
    message.match(/matr[ií]cula\s*(?:es|:|#)?\s*(\d{4,12})\b/i)?.[1] ||
    message.match(/\b(\d{6,12})\b/)?.[1] ||
    null;
  return {
    // Mentioning a process (for example, asking what Clause 97 means) must not
    // trigger a private lookup. DeVi may consult progress lists only when the
    // person explicitly asks for a place, progressive number or personal
    // status.
    isLookup: explicitLookup,
    targetMatricula,
    processTypes,
  };
}
