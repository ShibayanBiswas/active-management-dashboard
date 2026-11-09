/**
 * Shared Anand Rathi branding for downloadable sample input workbooks.
 * Logo and masthead sit above the sheet. Tables themselves stay uncolored:
 * no fills, dark labels, thin gray borders.
 */
import type ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

import {
  EXCEL_FONT,
  EXCEL_THEME,
  addExcelMasthead,
  excelFill,
  excelThin,
} from "../lib/workbook/export-theme";

const LOGO_PATH = path.join(process.cwd(), "public/brand/arwl-logo.png");

export function sampleLogoPath(): string {
  return LOGO_PATH;
}

export function sampleHasLogo(): boolean {
  return fs.existsSync(LOGO_PATH);
}

/** Count images on the first worksheet (ExcelJS). */
export async function countSheetImages(filePath: string): Promise<number> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return 0;
  const imgs =
    typeof (ws as { getImages?: () => unknown[] }).getImages === "function"
      ? (ws as { getImages: () => unknown[] }).getImages()
      : [];
  return Array.isArray(imgs) ? imgs.length : 0;
}

/** True when the title band uses desk maroon. */
export async function sampleHasMaroonMasthead(filePath: string): Promise<boolean> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return false;
  for (let r = 1; r <= 12; r += 1) {
    for (let c = 1; c <= 4; c += 1) {
      const fill = (ws.getCell(r, c).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
      if (fill === EXCEL_THEME.maroonDeep || fill === EXCEL_THEME.maroon) return true;
    }
  }
  return false;
}

/** Logo wash + desk masthead. Returns the first free content row. */
export function applySampleDeskBrand(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  cols: number,
): number {
  const toCol = Math.max(cols, 8);
  let rowOffset = 0;

  if (sampleHasLogo()) {
    const imageId = wb.addImage({ filename: LOGO_PATH, extension: "png" });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 210, height: 48 },
    });
    for (let c = 1; c <= toCol; c += 1) {
      ws.getCell(1, c).fill = excelFill(EXCEL_THEME.goldPale);
      ws.getCell(2, c).fill = excelFill(EXCEL_THEME.goldPale);
      ws.getCell(3, c).fill = excelFill(EXCEL_THEME.goldPale);
    }
    ws.getRow(1).height = 30;
    ws.getRow(2).height = 18;
    ws.getRow(3).height = 6;
    rowOffset = 3;
  }

  return addExcelMasthead(ws, {
    title,
    subtitle,
    eyebrow: "Anand Rathi Wealth · Unwinding Calculator",
    fromCol: 1,
    toCol,
    rowOffset,
  });
}

/** Table header — bold ink on a clear cell. No fill, no brand colour. */
export function styleSampleHeaderCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "none" };
  cell.font = {
    bold: true,
    color: { argb: EXCEL_THEME.ink },
    name: EXCEL_FONT,
    size: 9,
  };
  cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  cell.border = {
    top: excelThin(EXCEL_THEME.border),
    left: excelThin(EXCEL_THEME.border),
    bottom: excelThin(EXCEL_THEME.border),
    right: excelThin(EXCEL_THEME.border),
  };
}

export function styleSampleDataCell(
  cell: ExcelJS.Cell,
  opts?: { horizontal?: ExcelJS.Alignment["horizontal"]; wrap?: boolean },
) {
  cell.font = { name: EXCEL_FONT, size: 9, color: { argb: EXCEL_THEME.ink } };
  cell.alignment = {
    vertical: "middle",
    horizontal: opts?.horizontal ?? "center",
    wrapText: Boolean(opts?.wrap),
  };
  cell.border = {
    top: excelThin(EXCEL_THEME.border),
    left: excelThin(EXCEL_THEME.border),
    bottom: excelThin(EXCEL_THEME.border),
    right: excelThin(EXCEL_THEME.border),
  };
}
