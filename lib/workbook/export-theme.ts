/**
 * Shared Anand Rathi desk export theme — Excel + PDF.
 * Same maroon / gold language as the Primary SP Dashboard.
 */
import type ExcelJS from "exceljs";

import type { ExcelCell } from "@/lib/workbook/excel-cells";
import { writeExcelCell } from "@/lib/workbook/excel-cells";

/** ARGB hex for ExcelJS fills / fonts / borders. */
export const EXCEL_THEME = {
  maroon: "FF7A1E2C",
  maroonDeep: "FF5C1622",
  maroonSoft: "FFF7EDEF",
  gold: "FFD4B24C",
  goldRich: "FFC4A03E",
  goldSoft: "FFF6EDCF",
  goldPale: "FFFCF8EE",
  ivory: "FFFAF7EF",
  parchment: "FFF8F4EA",
  white: "FFFFFFFF",
  ink: "FF1C1917",
  inkSoft: "FF44403C",
  muted: "FF78716C",
  label: "FFF3EFE6",
  border: "FFE7E1CF",
  borderStrong: "FFD4B24C",
  rule: "FFC9B88A",
} as const;

/** RGB tuples for jsPDF. */
export const PDF_THEME = {
  maroon: [122, 30, 44] as [number, number, number],
  maroonDeep: [92, 22, 34] as [number, number, number],
  maroonSoft: [247, 237, 239] as [number, number, number],
  gold: [212, 178, 76] as [number, number, number],
  goldRich: [196, 160, 62] as [number, number, number],
  goldSoft: [246, 237, 207] as [number, number, number],
  goldPale: [252, 248, 238] as [number, number, number],
  ivory: [250, 247, 239] as [number, number, number],
  parchment: [248, 244, 234] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  ink: [28, 25, 23] as [number, number, number],
  inkSoft: [68, 64, 60] as [number, number, number],
  muted: [120, 113, 108] as [number, number, number],
  label: [243, 239, 230] as [number, number, number],
  border: [231, 225, 207] as [number, number, number],
};

export const EXCEL_FONT = "Calibri";

export function excelFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export function excelThin(argb: string = EXCEL_THEME.border): Partial<ExcelJS.Border> {
  return { style: "thin", color: { argb } };
}

export function excelHairline(argb: string = EXCEL_THEME.rule): Partial<ExcelJS.Border> {
  return { style: "hair", color: { argb } };
}

export function excelMedium(argb: string = EXCEL_THEME.gold): Partial<ExcelJS.Border> {
  return { style: "medium", color: { argb } };
}

export const excelBox: Partial<ExcelJS.Borders> = {
  top: excelThin(),
  left: excelThin(),
  bottom: excelThin(),
  right: excelThin(),
};

export const excelGoldBox: Partial<ExcelJS.Borders> = {
  top: excelThin(EXCEL_THEME.gold),
  left: excelThin(EXCEL_THEME.gold),
  bottom: excelThin(EXCEL_THEME.gold),
  right: excelThin(EXCEL_THEME.gold),
};

const DESK_DATE_TEXT_RE = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/;
const DESK_DATE_HEADER_RE = /\bdate\b/i;

/** True when the cell renders as a desk date (native Date, date numFmt, or dd-mmm-yy text). */
export function excelCellLooksLikeDate(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  if (v instanceof Date) return true;
  const fmt = String(cell.numFmt ?? "");
  if (/[dym]/i.test(fmt) && /mmm|yyyy|yy|dd/i.test(fmt)) return true;
  if (typeof v === "string" && DESK_DATE_TEXT_RE.test(v.trim())) return true;
  return false;
}

/** Display length of a cell value for autofit. */
export function excelCellDisplayLength(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") {
    const fmt = String(cell.numFmt ?? "");
    if (fmt.includes("%")) return Math.max(4, `${(v * 100).toFixed(2)}%`.length);
    // Excel date serials with dd-mmm-yy need room or the cell prints ####.
    if (/[dym]/i.test(fmt) && /mmm|yyyy|yy|dd/i.test(fmt)) return 12;
    return v.toLocaleString("en-IN", { maximumFractionDigits: 4 }).length;
  }
  if (v instanceof Date) return 12;
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((part) => part.text).join("").length;
    }
    if ("result" in v && v.result != null && typeof v.result !== "object") {
      return String(v.result).length;
    }
    if ("text" in v) return String((v as { text?: unknown }).text ?? "").length;
    if ("formula" in v) return 12;
  }
  const text = String(v);
  if (DESK_DATE_TEXT_RE.test(text.trim())) return Math.max(12, text.length);
  return text.length;
}

/**
 * Size each column to the longest visible cell.
 * Date columns get a hard floor so Excel never renders #### for dd-mmm-yy values.
 * Cap at `max` so extreme formulae columns stay usable.
 * Full-width merged chrome (masthead / section / disclaimer starting at column A) is
 * ignored so banners do not inflate every column. Mid-sheet value merges (e.g. B:F key
 * values) still size their master column from the cell text.
 */
export function autofitExcelColumns(sheet: ExcelJS.Worksheet, max = 60): void {
  const multiColMerges = new Map<string, { startCol: number; endCol: number }>();
  for (const merge of sheet.model.merges ?? []) {
    const text = String(merge);
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(text);
    if (!m) continue;
    const startCol = columnLettersToNumber(m[1]!);
    const endCol = columnLettersToNumber(m[3]!);
    if (endCol > startCol) {
      multiColMerges.set(`${m[1]!.toUpperCase()}${m[2]}`, { startCol, endCol });
    }
  }

  sheet.columns.forEach((col, colIndex) => {
    if (!col || typeof col.eachCell !== "function") return;
    let longest = 1;
    let dateColumn = false;
    const headerText = String(sheet.getRow(1).getCell((colIndex ?? 0) + 1).value ?? "");
    if (DESK_DATE_HEADER_RE.test(headerText)) dateColumn = true;

    col.eachCell({ includeEmpty: false }, (cell) => {
      if (excelCellLooksLikeDate(cell)) dateColumn = true;
      if (typeof cell.value === "string" && DESK_DATE_HEADER_RE.test(cell.value)) dateColumn = true;
      if (cell.isMerged) {
        const master = cell.master ?? cell;
        if (cell !== master) return;
        const info = multiColMerges.get(String(master.address).toUpperCase());
        if (info) {
          if (info.startCol === 1) return;
          longest = Math.max(longest, excelCellDisplayLength(cell));
          return;
        }
      }
      longest = Math.max(longest, excelCellDisplayLength(cell));
    });

    // +1 padding: Calibri character width under-measures vs Excel's column unit,
    // which is what produced #### on date cells with exact string length widths.
    const floor = dateColumn ? 14 : 10;
    const pad = dateColumn ? 2 : 3;
    col.width = Math.min(max, Math.max(floor, longest + pad));
  });
}

function columnLettersToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/**
 * Classy desk masthead — gold rule, maroon title band, gold subtitle, ink eyebrow.
 * Returns the next free content row.
 */
export function addExcelMasthead(
  sheet: ExcelJS.Worksheet,
  options: {
    title: string;
    subtitle: string;
    eyebrow?: string;
    fromCol?: number;
    toCol?: number;
    rowOffset?: number;
  },
): number {
  const from = options.fromCol ?? 1;
  const to = options.toCol ?? 10;
  const base = options.rowOffset ?? 0;

  sheet.mergeCells(1 + base, from, 1 + base, to);
  const rule = sheet.getCell(1 + base, from);
  rule.fill = excelFill(EXCEL_THEME.gold);
  sheet.getRow(1 + base).height = 5;

  sheet.mergeCells(2 + base, from, 2 + base, to);
  const banner = sheet.getCell(2 + base, from);
  banner.value = options.title;
  banner.fill = excelFill(EXCEL_THEME.maroonDeep);
  banner.font = {
    bold: true,
    size: 18,
    color: { argb: EXCEL_THEME.white },
    name: EXCEL_FONT,
  };
  banner.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2 + base).height = 36;

  sheet.mergeCells(3 + base, from, 3 + base, to);
  const sub = sheet.getCell(3 + base, from);
  sub.value = options.subtitle;
  sub.fill = excelFill(EXCEL_THEME.gold);
  sub.font = {
    bold: true,
    size: 10,
    color: { argb: EXCEL_THEME.ink },
    name: EXCEL_FONT,
  };
  sub.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(3 + base).height = 22;

  let next = 4 + base;
  if (options.eyebrow?.trim()) {
    sheet.mergeCells(next, from, next, to);
    const eye = sheet.getCell(next, from);
    eye.value = options.eyebrow;
    eye.fill = excelFill(EXCEL_THEME.parchment);
    eye.font = {
      size: 8,
      italic: true,
      color: { argb: EXCEL_THEME.muted },
      name: EXCEL_FONT,
    };
    eye.alignment = { vertical: "middle", horizontal: "left" };
    eye.border = { bottom: excelThin(EXCEL_THEME.rule) };
    sheet.getRow(next).height = 16;
    next += 1;
  }

  sheet.getRow(next).height = 8;
  return next + 1;
}

/** Section rail — maroon accent bar + soft gold wash. */
export function addExcelSection(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  fromCol = 1,
  toCol = 6,
): number {
  sheet.mergeCells(row, fromCol, row, toCol);
  const cell = sheet.getCell(row, fromCol);
  cell.value = title.toUpperCase();
  cell.fill = excelFill(EXCEL_THEME.goldSoft);
  cell.font = {
    bold: true,
    size: 11,
    color: { argb: EXCEL_THEME.maroon },
    name: EXCEL_FONT,
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.border = {
    left: excelMedium(EXCEL_THEME.maroon),
    bottom: excelThin(EXCEL_THEME.gold),
    top: excelHairline(EXCEL_THEME.rule),
    right: excelHairline(EXCEL_THEME.rule),
  };
  sheet.getRow(row).height = 24;
  return row + 1;
}

/** Classy KPI tiles — 2-up pale-gold cards; lone last metric spans full width. */
export function addExcelKpiTiles(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, ExcelCell]>,
  toCol = 6,
): number {
  let r = startRow;
  const pairs: Array<Array<[string, ExcelCell]>> = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }
  const mid = Math.floor(toCol / 2);

  const paintTile = (
    row: number,
    startCol: number,
    endCol: number,
    label: string,
    value: ExcelCell,
  ) => {
    for (let rr = row; rr <= row + 1; rr++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = sheet.getCell(rr, c);
        cell.fill = excelFill(EXCEL_THEME.goldPale);
        cell.border = {
          top: rr === row ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          bottom: rr === row + 1 ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          left: c === startCol ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          right: c === endCol ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
        };
      }
    }

    sheet.mergeCells(row, startCol, row, endCol);
    const labelCell = sheet.getCell(row, startCol);
    labelCell.value = label.toUpperCase();
    labelCell.font = {
      size: 8,
      color: { argb: EXCEL_THEME.muted },
      name: EXCEL_FONT,
      bold: true,
    };
    labelCell.fill = excelFill(EXCEL_THEME.goldPale);
    labelCell.alignment = { vertical: "bottom", horizontal: "left", wrapText: true };
    labelCell.border = {
      top: excelThin(EXCEL_THEME.gold),
      left: excelMedium(EXCEL_THEME.maroon),
      bottom: excelHairline(EXCEL_THEME.rule),
      right: excelThin(EXCEL_THEME.gold),
    };

    sheet.mergeCells(row + 1, startCol, row + 1, endCol);
    const valueCell = sheet.getCell(row + 1, startCol);
    writeExcelCell(valueCell, value, label);
    valueCell.font = {
      bold: true,
      size: 14,
      color: { argb: EXCEL_THEME.maroonDeep },
      name: EXCEL_FONT,
    };
    valueCell.fill = excelFill(EXCEL_THEME.goldPale);
    valueCell.alignment = { vertical: "top", horizontal: "left", wrapText: false };
    valueCell.border = {
      top: excelHairline(EXCEL_THEME.rule),
      left: excelMedium(EXCEL_THEME.maroon),
      bottom: excelThin(EXCEL_THEME.gold),
      right: excelThin(EXCEL_THEME.gold),
    };
  };

  for (const pair of pairs) {
    const solo = pair.length === 1;
    if (solo) {
      const [label, value] = pair[0]!;
      paintTile(r, 1, toCol, label, value);
    } else {
      pair.forEach(([label, value], colIdx) => {
        const startCol = colIdx === 0 ? 1 : mid + 1;
        const endCol = colIdx === 0 ? mid : toCol;
        paintTile(r, startCol, endCol, label, value);
      });
    }

    sheet.getRow(r).height = 16;
    sheet.getRow(r + 1).height = 24;
    const spacer = r + 2;
    for (let c = 1; c <= toCol; c++) {
      sheet.getCell(spacer, c).fill = excelFill(EXCEL_THEME.parchment);
      sheet.getCell(spacer, c).border = {
        top: excelHairline(EXCEL_THEME.parchment),
        bottom: excelHairline(EXCEL_THEME.parchment),
        left: excelHairline(EXCEL_THEME.parchment),
        right: excelHairline(EXCEL_THEME.parchment),
      };
    }
    sheet.getRow(spacer).height = 6;
    r += 3;
  }
  return r;
}
