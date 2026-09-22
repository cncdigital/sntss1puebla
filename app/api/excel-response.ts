import * as XLSX from "xlsx";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ExcelCell = string | number | boolean | Date | null | undefined;

export type ExcelColumn = {
  header: string;
  width: number;
  numberFormat?: string;
};

type ExcelWorkbookOptions = {
  title: string;
  dataSheetName: string;
  columns: readonly ExcelColumn[];
  rows: readonly (readonly ExcelCell[])[];
  summaryRows?: readonly (readonly ExcelCell[])[];
  summarySheetName?: string;
};

function validCell(value: ExcelCell): ExcelCell {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  if (value instanceof Date && Number.isNaN(value.getTime())) return "";
  return value;
}

function applyNumberFormats(
  sheet: XLSX.WorkSheet,
  columns: readonly ExcelColumn[],
  rowCount: number,
) {
  columns.forEach((column, columnIndex) => {
    if (!column.numberFormat) return;
    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      if (cell?.t === "n") cell.z = column.numberFormat;
    }
  });
}

export function createExcelWorkbook({
  title,
  dataSheetName,
  columns,
  rows,
  summaryRows = [],
  summarySheetName = "Resumen",
}: ExcelWorkbookOptions) {
  const normalizedRows = rows.map((row) =>
    columns.map((_, columnIndex) => validCell(row[columnIndex])),
  );
  const dataSheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.header),
    ...normalizedRows,
  ]);
  dataSheet["!cols"] = columns.map((column) => ({ wch: column.width }));
  dataSheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(columns.length - 1)}${normalizedRows.length + 1}`,
  };
  applyNumberFormats(dataSheet, columns, normalizedRows.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, dataSheetName);

  if (summaryRows.length) {
    const summarySheet = XLSX.utils.aoa_to_sheet(
      summaryRows.map((row) => row.map(validCell)),
    );
    summarySheet["!cols"] = [{ wch: 26 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, summarySheetName);
  }

  workbook.Props = {
    Title: title,
    Subject: "Exportación de Credenciales SNTSS1Puebla",
    Author: "Credenciales SNTSS1Puebla",
    Company: "SNTSS Sección 1 Puebla",
    CreatedDate: new Date(),
  };

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
    cellStyles: true,
  }) as ArrayBuffer;
}

export function excelAttachmentResponse(bytes: ArrayBuffer, fileName: string) {
  return new Response(bytes, {
    headers: {
      "content-type": XLSX_CONTENT_TYPE,
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
