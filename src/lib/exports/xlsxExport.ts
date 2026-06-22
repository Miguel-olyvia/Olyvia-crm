import * as XLSX from "xlsx";

export type StandardExportCellType = "text" | "number" | "date" | "boolean";

export interface StandardExportColumn {
  key: string;
  header: string;
  type?: StandardExportCellType;
  width?: number;
}

export interface StandardExportPayload {
  sheetName: string;
  columns: StandardExportColumn[];
  rows: Array<Record<string, unknown>>;
}

const FORMULA_PREFIX = /^\s*[=+\-@]/;
const EXCEL_MAX_SHEET_NAME = 31;

export function normalizeExportCell(
  value: unknown,
  type: StandardExportCellType = "text",
): string | number | boolean | Date {
  if (value === null || value === undefined) return "";

  if (type === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : "";
  }

  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    return ["true", "1", "sim", "yes"].includes(String(value).trim().toLowerCase());
  }

  if (type === "date") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed;
  }

  const text = String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function safeSheetName(name: string): string {
  const sanitized = name.replace(/[\\/?*[\]:]/g, " ").trim() || "Exportação";
  return sanitized.slice(0, EXCEL_MAX_SHEET_NAME);
}

function resolveColumnWidth(
  column: StandardExportColumn,
  rows: Array<Record<string, unknown>>,
): number {
  if (column.width) return column.width;
  const longestValue = rows.reduce((max, row) => {
    const value = row[column.key];
    return Math.max(max, String(value ?? "").length);
  }, column.header.length);
  return Math.min(Math.max(longestValue + 2, 12), 48);
}

export function buildStandardWorkbook(payload: StandardExportPayload): XLSX.WorkBook {
  const matrix = [
    payload.columns.map((column) => column.header),
    ...payload.rows.map((row) =>
      payload.columns.map((column) =>
        normalizeExportCell(row[column.key], column.type ?? "text"),
      ),
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(matrix, { cellDates: true });
  const lastRow = Math.max(matrix.length, 1);
  const lastColumn = Math.max(payload.columns.length - 1, 0);

  if (payload.columns.length > 0) {
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: lastRow - 1, c: lastColumn },
      }),
    };
  }
  worksheet["!cols"] = payload.columns.map((column) => ({
    wch: resolveColumnWidth(column, payload.rows),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(payload.sheetName));
  return workbook;
}

export function downloadStandardXlsx(
  payload: StandardExportPayload,
  filename: string,
): void {
  const safeFilename = filename.toLowerCase().endsWith(".xlsx")
    ? filename
    : `${filename}.xlsx`;
  XLSX.writeFile(buildStandardWorkbook(payload), safeFilename, {
    bookType: "xlsx",
    compression: true,
    cellDates: true,
  });
}
