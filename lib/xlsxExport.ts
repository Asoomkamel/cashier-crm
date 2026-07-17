import {
  emptyRowForColumns,
  getArabicColumnLabel,
  getArabicSheetName,
  getSheetColumns,
  translateValueForExport,
} from "./xlsxSchemas";

export type WorkbookPayload = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cellValue(key: string, value: unknown): unknown {
  // Keep raw timestamps as numbers so re-importing the XLSX restores the same data.
  // Human-readable dates are shown in the UI/report pages; the workbook is a data file.
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function toRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.map((item, index) => {
      if (!isPlainObject(item)) return { index: index + 1, value: cellValue("value", item) };
      const row: Record<string, unknown> = { index: index + 1 };
      Object.entries(item).forEach(([key, val]) => {
        row[key] = cellValue(key, val);
      });
      return row;
    });
  }

  if (isPlainObject(value)) {
    const row: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, val]) => {
      row[key] = cellValue(key, val);
    });
    return [row];
  }

  return [{ value: cellValue("value", value) }];
}

function localizeRows(rows: Record<string, unknown>[], columns: string[]): Record<string, unknown>[] {
  const safeColumns = columns.length ? columns : ["id"];
  const sourceRows = rows.length > 0 ? rows : [emptyRowForColumns(safeColumns)];
  return sourceRows.map((row) => {
    const next: Record<string, unknown> = {};
    safeColumns.forEach((column) => {
      next[getArabicColumnLabel(column)] = translateValueForExport(column, row[column]);
    });
    return next;
  });
}

function safeSheetName(name: string, fallback: string): string {
  const cleaned = String(name || fallback).replace(/[\\/?*\[\]:]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

export async function downloadWorkbookXlsx(fileName: string, payload: WorkbookPayload) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  Object.entries(payload).forEach(([key, value], index) => {
    const rows = toRows(value);
    const columns = getSheetColumns(key, rows);
    const safeColumns = columns.length ? columns : ["id"];
    const localizedRows = localizeRows(rows, safeColumns);
    const localizedHeaders = safeColumns.map(getArabicColumnLabel);
    const worksheet = XLSX.utils.json_to_sheet(localizedRows, { header: localizedHeaders });
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(getArabicSheetName(key), `Sheet ${index + 1}`));
  });

  if (workbook.SheetNames.length === 0) {
    const worksheet = XLSX.utils.json_to_sheet([{ ملاحظة: "لا توجد بيانات" }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "البيانات");
  }

  XLSX.writeFile(workbook, fileName, { compression: true });
}

export function makeXlsxFileName(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefix}-${stamp}.xlsx`;
}
