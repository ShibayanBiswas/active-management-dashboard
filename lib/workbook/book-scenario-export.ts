/**
 * Book Scenario Table: metric tabs, screen rows and the Excel download, so the table and the
 * workbook read the same values. The workbook builder is Node-safe (no DOM); the download wraps it.
 */
import type ExcelJS from "exceljs";

import {
  BOOK_SCENARIO_SHIFTS,
  type BookScenarioCell,
  type BookScenarioRow,
} from "@/lib/active-management/book-scenario";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import {
  deskTodayISO,
  formatDeskDateFull,
  formatDeskRupees,
  formatNumber,
  formatPct,
  roundDeskMoney,
  underlyingFromProductName,
} from "@/lib/utils";
import { SCREEN_EXPORT_DISCLAIMER } from "@/lib/workbook/build-screen-excel";
import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import { writeExcelCell, type ExcelCell } from "@/lib/workbook/excel-cells";
import { createWorkbook } from "@/lib/workbook/excel-runtime";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  addExcelMasthead,
  addExcelSection,
  autofitExcelColumns,
  excelBox,
  excelFill,
  excelGoldBox,
  excelThin,
} from "@/lib/workbook/export-theme";

const DESK_EYEBROW = "Anand Rathi Wealth · Active Management Dashboard";
const DESK_FOOTER = "Active Management Dashboard · Confidential";

/** Excel formats, the same strings excel-cells.ts gives the desk headers. */
const RUPEES_FMT = '"₹"#,##0.00';
const PERCENT_FMT = "0.00%";
const LEVEL_FMT = "#,##0.00";

export type BookScenarioMetricId =
  | "unwindQuote"
  | "unwindQuoteChange"
  | "premiumOutflow"
  | "premiumOutflowChange"
  | "unwindValue"
  | "currentIrr"
  | "currentIrrChange"
  | "expectedDifference"
  | "expectedDifferenceChange";

type BookScenarioMetric = {
  id: BookScenarioMetricId;
  label: string;
  /** Workbook sheet name: Excel allows at most 31 characters. */
  sheet: string;
  kind: "rupees" | "rate";
  /** Change metrics are this level less the 0 column. */
  change: boolean;
  value: (cell: BookScenarioCell, base: BookScenarioCell | undefined) => number | null;
};

const moneyChange = (a: number | null, b: number | null | undefined) =>
  a == null || b == null ? null : roundDeskMoney(a - b);
const rateChange = (a: number | null, b: number | null | undefined) => (a == null || b == null ? null : a - b);

/** The metric tabs, in tab and workbook sheet order. */
export const BOOK_SCENARIO_METRICS: readonly BookScenarioMetric[] = [
  { id: "unwindQuote", label: "Unwind Quote Amount", sheet: "Unwind Quote Amount", kind: "rupees", change: false, value: (c) => c.unwindQuoteRs },
  {
    id: "unwindQuoteChange",
    label: "Change In Unwind Quote Amount",
    sheet: "Change In Unwind Quote Amount",
    kind: "rupees",
    change: true,
    value: (c, b) => moneyChange(c.unwindQuoteRs, b?.unwindQuoteRs),
  },
  { id: "premiumOutflow", label: "Premium Outflow", sheet: "Premium Outflow", kind: "rupees", change: false, value: (c) => c.premiumOutflowRs },
  {
    id: "premiumOutflowChange",
    label: "Change In Premium Outflow",
    sheet: "Change In Premium Outflow",
    kind: "rupees",
    change: true,
    value: (c, b) => moneyChange(c.premiumOutflowRs, b?.premiumOutflowRs),
  },
  { id: "unwindValue", label: "Unwind Value", sheet: "Unwind Value", kind: "rupees", change: false, value: (c) => c.unwindValueRs },
  {
    id: "currentIrr",
    label: "Current Internal Rate of Return",
    sheet: "Current Internal Rate of Return",
    kind: "rate",
    change: false,
    value: (c) => c.currentIrr,
  },
  {
    id: "currentIrrChange",
    label: "Change In Current Internal Rate of Return",
    sheet: "Change In Current Return Rate",
    kind: "rate",
    change: true,
    value: (c, b) => rateChange(c.currentIrr, b?.currentIrr),
  },
  {
    id: "expectedDifference",
    label: "Expected Difference",
    sheet: "Expected Difference",
    kind: "rupees",
    change: false,
    value: (c) => c.expectedDifferenceRs,
  },
  {
    id: "expectedDifferenceChange",
    label: "Change In Expected Difference",
    sheet: "Change In Expected Difference",
    kind: "rupees",
    change: true,
    value: (c, b) => moneyChange(c.expectedDifferenceRs, b?.expectedDifferenceRs),
  },
];

/** −1,000 … 0 … +1,000. */
function bookScenarioShiftLabel(shift: number): string {
  if (shift === 0) return "0";
  return `${shift < 0 ? "−" : "+"}${formatNumber(Math.abs(shift), 0)}`;
}

const IDENTITY_HEADERS = ["Product Name", "Product Code", "Underlying", "Base Level"] as const;

export const BOOK_SCENARIO_HEADERS: readonly string[] = [
  ...IDENTITY_HEADERS,
  ...BOOK_SCENARIO_SHIFTS.map(bookScenarioShiftLabel),
];

/** Product Name, Product Code, Underlying and Base Level come before the levels. */
export const BOOK_SCENARIO_IDENTITY_COLS = IDENTITY_HEADERS.length;

/** The 0 column: today's spot. */
export const BOOK_SCENARIO_CENTRE_COL = BOOK_SCENARIO_IDENTITY_COLS + BOOK_SCENARIO_SHIFTS.indexOf(0);

/** The metric at each shift, in BOOK_SCENARIO_SHIFTS order. */
function metricValues(row: BookScenarioRow, metric: BookScenarioMetric): Array<number | null> {
  const byShift = new Map(row.cells.map((cell) => [cell.shift, cell]));
  const base = byShift.get(0);
  return BOOK_SCENARIO_SHIFTS.map((shift) => {
    const cell = byShift.get(shift);
    if (!cell) return null;
    const value = metric.value(cell, base);
    return value != null && Number.isFinite(value) ? value : null;
  });
}

function identity(product: ProductMaster, row: BookScenarioRow | null | undefined) {
  return {
    name: product.productName?.trim() || "-",
    code: product.productCode?.trim() || "-",
    underlying: row?.underlying ?? underlyingFromProductName(product.productName, product.productCode),
  };
}

/**
 * One screen row. row undefined: still pricing ("…"). row null: the product could not be priced ("-").
 */
export function bookScenarioDisplayRow(
  product: ProductMaster,
  row: BookScenarioRow | null | undefined,
  metric: BookScenarioMetric,
): string[] {
  const id = identity(product, row);
  if (row === undefined) return [id.name, id.code, id.underlying, "…", ...BOOK_SCENARIO_SHIFTS.map(() => "…")];
  if (row === null) return [id.name, id.code, id.underlying, "-", ...BOOK_SCENARIO_SHIFTS.map(() => "-")];
  const format = metric.kind === "rupees" ? formatDeskRupees : formatPct;
  return [id.name, id.code, id.underlying, formatNumber(row.baseSpot, 2), ...metricValues(row, metric).map((v) => format(v))];
}

/** One download row: native numbers, "-" where the screen shows "-". */
function bookScenarioExcelRow(
  product: ProductMaster,
  row: BookScenarioRow | null | undefined,
  metric: BookScenarioMetric,
): ExcelCell[] {
  const id = identity(product, row);
  if (!row) return [id.name, id.code, id.underlying, "-", ...BOOK_SCENARIO_SHIFTS.map(() => "-")];
  return [
    id.name,
    id.code,
    id.underlying,
    Number.isFinite(row.baseSpot) ? row.baseSpot : "-",
    ...metricValues(row, metric).map((v): ExcelCell => (v == null ? "-" : v)),
  ];
}

/* ── Workbook ─────────────────────────────────────────────────────────── */

/** Desk data table: maroon header, banded rows, native values; the 0 column shaded like the scenario base row. */
function addScenarioTable(sheet: ExcelJS.Worksheet, startRow: number, rows: ExcelCell[][], metric: BookScenarioMetric): number {
  const valueFmt = metric.kind === "rupees" ? RUPEES_FMT : PERCENT_FMT;
  const headerRow = sheet.getRow(startRow);
  BOOK_SCENARIO_HEADERS.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    const centre = i === BOOK_SCENARIO_CENTRE_COL;
    cell.value = header;
    cell.fill = excelFill(centre ? EXCEL_THEME.gold : EXCEL_THEME.maroonDeep);
    cell.font = { bold: true, size: 9, color: { argb: centre ? EXCEL_THEME.maroonDeep : EXCEL_THEME.white }, name: EXCEL_FONT };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = excelGoldBox;
  });
  headerRow.height = 26;

  rows.forEach((row, ri) => {
    const wsRow = sheet.getRow(startRow + 1 + ri);
    const band = ri % 2 === 0 ? EXCEL_THEME.white : EXCEL_THEME.ivory;
    row.forEach((value, ci) => {
      const cell = wsRow.getCell(ci + 1);
      const header = BOOK_SCENARIO_HEADERS[ci] ?? "";
      const centre = ci === BOOK_SCENARIO_CENTRE_COL;
      writeExcelCell(cell, value, header);
      if (typeof cell.value === "number") cell.numFmt = ci < IDENTITY_HEADERS.length ? LEVEL_FMT : valueFmt;
      cell.font = {
        size: 9,
        bold: centre,
        color: { argb: centre ? EXCEL_THEME.maroonDeep : EXCEL_THEME.ink },
        name: EXCEL_FONT,
      };
      cell.fill = excelFill(centre ? EXCEL_THEME.goldSoft : band);
      cell.alignment = { vertical: "top", horizontal: ci === 0 ? "left" : "center", wrapText: true };
      cell.border = excelBox;
    });
    wsRow.height = 18;
  });
  return startRow + 1 + rows.length + 1;
}

function addDisclaimer(sheet: ExcelJS.Worksheet, row: number, toCol: number): void {
  const labelRow = row + 2;
  sheet.getRow(row + 1).height = 10;
  sheet.mergeCells(labelRow, 1, labelRow, toCol);
  const label = sheet.getCell(labelRow, 1);
  label.value = "DISCLAIMER";
  label.fill = excelFill(EXCEL_THEME.parchment);
  label.font = { bold: true, size: 8, color: { argb: EXCEL_THEME.maroon }, name: EXCEL_FONT };
  label.alignment = { vertical: "middle", horizontal: "left" };
  label.border = {
    top: { style: "medium", color: { argb: EXCEL_THEME.gold } },
    left: excelThin(EXCEL_THEME.rule),
    right: excelThin(EXCEL_THEME.rule),
  };
  sheet.getRow(labelRow).height = 16;

  const bodyRow = labelRow + 1;
  sheet.mergeCells(bodyRow, 1, bodyRow, toCol);
  const body = sheet.getCell(bodyRow, 1);
  body.value = SCREEN_EXPORT_DISCLAIMER;
  body.fill = excelFill(EXCEL_THEME.parchment);
  body.font = { italic: true, size: 8, color: { argb: EXCEL_THEME.muted }, name: EXCEL_FONT };
  body.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  body.border = {
    left: excelThin(EXCEL_THEME.rule),
    right: excelThin(EXCEL_THEME.rule),
    bottom: excelThin(EXCEL_THEME.rule),
  };
  sheet.getRow(bodyRow).height = 62;
}

/** Landscape, one page wide, the desk footer: the print setup the other desk downloads use. */
function printLayout(sheet: ExcelJS.Worksheet, cols: number) {
  const lastRow = sheet.lastRow?.number ?? 1;
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    showGridLines: false,
    printArea: `A1:${sheet.getColumn(cols).letter}${lastRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = {
    oddFooter: `&LActive Management Dashboard · Anand Rathi Wealth&CPage &P of &N&R${DESK_FOOTER}`,
  };
}

/** One sheet per metric, each listing the products in the order given. */
export async function buildBookScenarioWorkbook(
  products: ProductMaster[],
  rows: Record<string, BookScenarioRow | null>,
  options?: { logoOffset?: number; viewNote?: string },
): Promise<ExcelJS.Workbook> {
  const wb = await createWorkbook();
  const cols = BOOK_SCENARIO_HEADERS.length;
  const subtitle = [
    options?.viewNote?.trim(),
    `${products.length.toLocaleString("en-IN")} Products`,
    `Index Levels ${bookScenarioShiftLabel(BOOK_SCENARIO_SHIFTS[0]!)} To ${bookScenarioShiftLabel(BOOK_SCENARIO_SHIFTS[BOOK_SCENARIO_SHIFTS.length - 1]!)} Points Around Today's Spot`,
    `Generated ${formatDeskDateFull(deskTodayISO())}`,
  ]
    .filter(Boolean)
    .join(" · ");
  for (const metric of BOOK_SCENARIO_METRICS) {
    const ws = wb.addWorksheet(metric.sheet, { views: [{ showGridLines: false }] });
    let row = addExcelMasthead(ws, {
      title: "Book Scenario Table",
      subtitle,
      eyebrow: DESK_EYEBROW,
      fromCol: 1,
      toCol: cols,
      rowOffset: options?.logoOffset ?? 0,
    });
    row = addExcelSection(ws, row, metric.change ? `${metric.label} Against The 0 Column` : metric.label, 1, cols);
    row = addScenarioTable(
      ws,
      row,
      products.map((product) => bookScenarioExcelRow(product, rows[productKey(product)], metric)),
      metric,
    );
    addDisclaimer(ws, row, cols);
    autofitExcelColumns(ws);
    printLayout(ws, cols);
  }
  return wb;
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  if (typeof document === "undefined") throw new Error("Excel download is only available in the browser.");
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** SP-Book-Scenario-Table-{fileToken}-{date}.xlsx with the desk logo on every sheet. */
export async function downloadBookScenarioExcel(
  products: ProductMaster[],
  rows: Record<string, BookScenarioRow | null>,
  file: { fileToken: string; viewNote: string },
) {
  const logo = await fetchBrandLogoBase64();
  const wb = await buildBookScenarioWorkbook(products, rows, { logoOffset: logo ? 3 : 0, viewNote: file.viewNote });
  if (logo) {
    for (const sheet of wb.worksheets) embedBrandLogo(wb, sheet, logo, BOOK_SCENARIO_HEADERS.length);
  }
  await saveWorkbook(
    wb,
    buildDeskExportFilename({ screen: "Book-Scenario-Table", productName: file.fileToken, extension: "xlsx" }),
  );
}
