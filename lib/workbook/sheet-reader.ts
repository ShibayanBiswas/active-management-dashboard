import ExcelJS from "exceljs";

import { toIsoDate } from "@/lib/dates";

export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };

function normalise(value: ExcelJS.CellValue): Cell {
  if (value == null) return null;
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") {
    if ("result" in value) return normalise(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim() || null;
    if ("text" in value) return String(value.text).trim() || null;
    if ("error" in value) return null;
  }
  return null;
}

export async function readXlsx(buffer: ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = row.values as ExcelJS.CellValue[];
      rows[rowNumber - 1] = values.slice(1).map(normalise);
    });
    for (let i = 0; i < rows.length; i += 1) rows[i] ??= [];
    return { name: ws.name, rows };
  });
}

/** Minimal CSV reader: quoted fields, commas inside quotes, CRLF. */
export function readCsv(text: string, name = "CSV"): Sheet {
  const rows: Cell[][] = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: Cell[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        cells.push(cur.trim() || null);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim() || null);
    rows.push(cells);
  }
  return { name, rows };
}

export async function readUploadSheets(file: File): Promise<Sheet[]> {
  if (/\.csv$/i.test(file.name)) return [readCsv(await file.text(), file.name)];
  return readXlsx(await file.arrayBuffer());
}

/** Number from a desk cell: grouping commas, percent signs and "-" handled. */
export function toNumber(cell: Cell | undefined): number | null {
  if (cell == null) return null;
  if (typeof cell === "number") return cell;
  const text = cell.replace(/[,₹\s]/g, "");
  if (!text || text === "-") return null;
  const pct = text.endsWith("%");
  const n = Number(pct ? text.slice(0, -1) : text);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** ISO date from a desk cell: ISO strings, DD-MMM-YYYY, DD/MM/YYYY or an Excel serial. */
export function toIso(cell: Cell | undefined): string | null {
  if (cell == null) return null;
  if (typeof cell === "number") {
    if (cell < 20000 || cell > 80000) return null;
    return toIsoDate(new Date(Date.UTC(1899, 11, 30) + cell * 86_400_000));
  }
  const iso = cell.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mmm = cell.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})$/);
  if (mmm && MONTHS[mmm[2].toLowerCase()]) {
    const y = mmm[3].length === 2 ? 2000 + Number(mmm[3]) : Number(mmm[3]);
    return `${y}-${String(MONTHS[mmm[2].toLowerCase()]).padStart(2, "0")}-${mmm[1].padStart(2, "0")}`;
  }
  const dmy = cell.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

export function headerKey(cell: Cell | undefined): string {
  return String(cell ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
