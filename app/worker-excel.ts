import * as XLSX from "xlsx";

export type WorkerSpreadsheetRow = {
  matricula: string;
  fullName: string;
  category: string;
  unit: string;
  curp: string;
  rfc: string;
  nss: string;
  email: string;
  phone: string;
  active?: boolean;
};

export type WorkerSpreadsheetExportRow = Omit<WorkerSpreadsheetRow, "active"> & {
  active: boolean | number;
  updatedAt?: string | null;
};

type CellValue = string | number | boolean | Date | null | undefined;
type Matrix = CellValue[][];

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 25_000;

const HEADER_ALIASES = {
  matricula: [
    "matricula",
    "mat",
    "numeroempleado",
    "numerodetrabajador",
    "clavetrabajador",
  ],
  fullName: [
    "nombre",
    "nombrecompleto",
    "nombredeltrabajador",
    "fullname",
    "trabajador",
  ],
  category: ["categoria", "puest", "puesto", "descripcion1", "categoriacontractual"],
  unit: [
    "unidad",
    "adscripcion",
    "area",
    "areaderesp",
    "areaderesponsabilidad",
  ],
  curp: ["curp"],
  rfc: ["rfc", "registrofederaldecontribuyentes"],
  nss: ["nss", "numerodeseguridadsocial", "seguridadsocial"],
  email: ["email", "correo", "correoelectronico"],
  phone: ["telefono", "celular", "telefonocelular"],
  active: ["activo", "activa", "estatus", "estado"],
} as const;

function normalizeHeader(value: CellValue) {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function findColumn(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function activeValue(value: string): boolean | undefined {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleUpperCase("es-MX");
  if (!normalized) return undefined;
  if (["0", "NO", "INACTIVO", "INACTIVA", "FALSE", "FALSO", "BAJA"].includes(normalized))
    return false;
  if (["1", "SI", "ACTIVO", "ACTIVA", "TRUE", "VERDADERO", "ALTA"].includes(normalized))
    return true;
  return undefined;
}

function parseMatrix(matrix: Matrix) {
  const headerLimit = Math.min(matrix.length, 30);
  for (let headerIndex = 0; headerIndex < headerLimit; headerIndex += 1) {
    const headers = (matrix[headerIndex] || []).map(normalizeHeader);
    const positions = {
      matricula: findColumn(headers, HEADER_ALIASES.matricula),
      fullName: findColumn(headers, HEADER_ALIASES.fullName),
      category: findColumn(headers, HEADER_ALIASES.category),
      unit: findColumn(headers, HEADER_ALIASES.unit),
      curp: findColumn(headers, HEADER_ALIASES.curp),
      rfc: findColumn(headers, HEADER_ALIASES.rfc),
      nss: findColumn(headers, HEADER_ALIASES.nss),
      email: findColumn(headers, HEADER_ALIASES.email),
      phone: findColumn(headers, HEADER_ALIASES.phone),
      active: findColumn(headers, HEADER_ALIASES.active),
    };
    if (positions.matricula < 0 || positions.fullName < 0) continue;
    const value = (row: CellValue[], position: number) =>
      position >= 0 ? cellText(row[position]) : "";
    const rows = matrix
      .slice(headerIndex + 1)
      .map((row) => {
        const activeText = value(row, positions.active);
        return {
          matricula: value(row, positions.matricula),
          fullName: value(row, positions.fullName),
          category: value(row, positions.category),
          unit: value(row, positions.unit),
          curp: value(row, positions.curp),
          rfc: value(row, positions.rfc),
          nss: value(row, positions.nss),
          email: value(row, positions.email),
          phone: value(row, positions.phone),
          active: activeValue(activeText),
        } satisfies WorkerSpreadsheetRow;
      })
      .filter((row) => Object.values(row).some((entry) => entry !== "" && entry !== undefined));
    return { rows, headerIndex };
  }
  return null;
}

export async function readWorkerSpreadsheet(file: File) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name))
    throw new Error("Selecciona un archivo Excel .xlsx, .xls o un archivo .csv.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("El archivo supera el límite de 25 MB.");
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
      cellText: true,
      raw: false,
      codepage: 65001,
    });
  } catch {
    throw new Error("No fue posible leer el archivo. Verifica que sea un Excel válido.");
  }
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as Matrix;
    const parsed = parseMatrix(matrix);
    if (!parsed) continue;
    if (parsed.rows.length > MAX_ROWS)
      throw new Error("La hoja supera el máximo de 25,000 filas por carga.");
    return {
      rows: parsed.rows,
      sheetName,
      headerRow: parsed.headerIndex + 1,
    };
  }
  throw new Error(
    "No pude identificar las columnas Matrícula y Nombre en ninguna hoja del archivo.",
  );
}

function localDateStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function downloadWorkerWorkbook(rows: WorkerSpreadsheetExportRow[]) {
  const headers = [
    "Matrícula",
    "Nombre completo",
    "Categoría",
    "Adscripción",
    "CURP",
    "RFC",
    "NSS",
    "Correo",
    "Teléfono",
    "Activo",
    "Última actualización",
  ];
  const data = rows.map((row) => [
    row.matricula || "",
    row.fullName || "",
    row.category || "",
    row.unit || "",
    row.curp || "",
    row.rfc || "",
    row.nss || "",
    row.email || "",
    row.phone || "",
    Boolean(row.active) ? "Sí" : "No",
    row.updatedAt || "",
  ]);
  const rosterSheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  rosterSheet["!cols"] = [
    { wch: 14 },
    { wch: 38 },
    { wch: 30 },
    { wch: 26 },
    { wch: 21 },
    { wch: 17 },
    { wch: 15 },
    { wch: 30 },
    { wch: 18 },
    { wch: 10 },
    { wch: 22 },
  ];
  if (rows.length)
    rosterSheet["!autofilter"] = { ref: `A1:K${rows.length + 1}` };

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["IMPORTACIÓN DEL PADRÓN · CREDENCIALES SNTSS1PUEBLA"],
    [],
    ["1. La matrícula y el nombre completo son obligatorios."],
    ["2. No cambies los encabezados de la hoja Padrón."],
    ["3. Los campos opcionales vacíos conservan la información existente."],
    ["4. En Activo usa Sí o No. Si se deja vacío, se conserva el estado actual."],
    ["5. El sistema usa la matrícula para crear o actualizar cada trabajador."],
    [],
    ["Límite por archivo", "25,000 filas"],
    ["Formatos aceptados", ".xlsx, .xls y .csv"],
  ]);
  instructionsSheet["!cols"] = [{ wch: 75 }, { wch: 22 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, rosterSheet, "Padrón");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucciones");
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  }) as ArrayBuffer;
  const fileName = `padron-trabajadores-sntss1-${localDateStamp()}.xlsx`;
  const url = URL.createObjectURL(
    new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return fileName;
}
