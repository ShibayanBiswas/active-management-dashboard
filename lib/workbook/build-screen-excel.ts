/**
 * Node-safe Excel workbook builders for screen downloads (no DOM).
 * Browser wrappers in export-screen.ts call these then trigger a file save.
 */
import type ExcelJS from "exceljs";

import { createWorkbook } from "@/lib/workbook/excel-runtime";
import {
  OPTION_BOOK_HEADERS,
  PRICER_TABLE_HEADERS,
  PRODUCT_BOOK_HEADERS,
} from "@/lib/workbook/export-columns";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  addExcelKpiTiles,
  addExcelMasthead,
  addExcelSection,
  autofitExcelColumns,
  excelBox,
  excelFill,
  excelGoldBox,
  excelThin,
} from "@/lib/workbook/export-theme";
import { OPTION_BOOK_MERGE_COLS, PRICER_MERGE_COLS, PRODUCT_BOOK_MERGE_COLS } from "@/lib/workbook/table-merge";
import type { ExcelCell } from "@/lib/workbook/excel-cells";
import { writeExcelCell } from "@/lib/workbook/excel-cells";
import type { PricerRow, UnwindResult } from "@/lib/types";
import {
  capAtProductIrr,
  computeGroupedRowSpans,
  deskBlank,
  deskTodayISO,
  formatDeskDate,
  formatDeskDateFull,
  formatDeskRupees,
  formatNumber,
  formatPct,
  parseISODate,
} from "@/lib/utils";

const DESK_EYEBROW = "Anand Rathi Wealth · Active Management Dashboard";
export const SCREEN_EXPORT_DISCLAIMER =
  "The information provided in this communication is a reproduction of factual details. No part of the information provided herein should be construed as investment advice by ARWL and/or its employees. Investors/clients must make their own investment decisions based on their own specific investment objectives and financial position. This communication does not constitute an offer or solicitation for the purchase or sale of any financial instrument or security.";

type KV = Array<[string, ExcelCell]>;

function formatRs(v: number | null | undefined): string {
  return formatDeskRupees(v);
}

function screenExportStamp() {
  return `Generated ${formatDeskDateFull(deskTodayISO())}`;
}

function excelDate(value: string): ExcelCell {
  const date = parseISODate(value);
  return Number.isNaN(date.getTime()) ? "-" : date;
}

function inputRows(result: UnwindResult): KV {
  return [
    ["Product Name", deskBlank(result.productName)],
    ["Product Code", deskBlank(result.productCode)],
    ["Underlying", deskBlank(result.underlying || "")],
    ["Number of Debentures", result.debentures],
    ["Unwinding Date", excelDate(result.unwindDate)],
    ["Bid Ask Spread", result.bidAskSpread ?? "As Per Bid Ask Table"],
    ["Underlying Spot Level", result.spot],
  ];
}

function quoteRows(result: UnwindResult): KV {
  return [
    ["Unwind Quote Percent", result.unwindQuotePct],
    ["Unwind Quote Amount", result.unwindQuoteRs],
    ["Product Internal Rate of Return", result.productIRR],
    ["Client Internal Rate of Return", capAtProductIrr(result.clientIRR, result.productIRR)],
    ["Residual Internal Rate of Return", capAtProductIrr(result.residualIRR, result.productIRR)],
  ];
}

function factRows(result: UnwindResult): KV {
  return [
    ["Face Value", result.faceValue],
    ["Initial Underlying Level", result.initialNiftyLevel],
    ["Contingent Coupon", result.contingentCoupon],
    ["Inbuilt", result.inbuilt],
    ["Transaction Cost", result.tranCost],
    ["Issuance Cost", result.issuanceCost],
    ["Margin Cost", result.marginCost],
    ["Product Discounting Rate", result.discountingRate],
    ["Premium Discounting Rate", result.premiumRate],
    ["Delta Date", excelDate(result.deltaDate)],
    ["Allotment Date", excelDate(result.allotmentDate)],
    ["Maturity Date", excelDate(result.maturityDate)],
    ["Tenor", result.tenorDays],
    ["Invested Tenor", result.investedTenorDays],
    ["Residual Tenor", result.residualTenor],
  ];
}

function fundingRows(result: UnwindResult): KV {
  return [
    ["Total Debentures in Issue", result.totalDebs],
    ["Amount with NBFC Percent", result.amountWithNbfc],
    ["NBFC Grown Value Percent", result.nbfcGrownValue],
    ["Premium Credited Percent", result.premium],
    ["Premium Grown Value Percent", result.premiumGrownValue],
    ["Current Premium Outflow Percent", result.currentPremOutflowPct],
  ];
}

function rupeeRows(result: UnwindResult): KV {
  return [
    ["Amount with NBFC Rupees", result.masterEconomics.amtWithNbfcRs],
    ["NBFC Grown Value Rupees", result.masterEconomics.grownValueRs],
    ["Premium Credited", result.masterEconomics.premiumCreditedRs],
    ["Premium Grown Value Rupees", result.masterEconomics.premGrownValueRs],
    ["Premium Outflow", result.masterEconomics.premiumOutflowRs],
    ["Unwind Value", result.masterEconomics.unwindValueRs],
    ["Book Unwind Per Debenture", result.masterEconomics.unwindQuoteRs],
  ];
}

export function optionBookExcelRows(result: UnwindResult): ExcelCell[][] {
  return result.optionRows.map((r) => {
    const countedExpired = r.expired && Math.abs(r.unwindPrice) > 0;
    const unwindDisplay = countedExpired ? r.unwindPrice : Math.abs(r.unwindPrice);
    const expiry = parseISODate(r.expiry);
    return [
      deskBlank(r.options),
      r.strike,
      r.spreads,
      deskBlank(r.original),
      deskBlank(r.unwind),
      r.quantity,
      Number.isNaN(expiry.getTime()) ? "-" : expiry,
      r.premiumPerSpread == null ? "-" : r.premiumPerSpread,
      r.prdPremium,
      unwindDisplay,
      r.premiumOutflowRs,
    ];
  });
}

export function optionBookRowsFlat(result: UnwindResult): string[][] {
  return result.optionRows.map((r) => {
    const countedExpired = r.expired && Math.abs(r.unwindPrice) > 0;
    const unwindDisplay = countedExpired ? r.unwindPrice : Math.abs(r.unwindPrice);
    return [
      deskBlank(r.options),
      formatNumber(r.strike, 0),
      formatNumber(r.spreads, 2),
      deskBlank(r.original),
      deskBlank(r.unwind),
      formatNumber(r.quantity, 2),
      formatDeskDate(r.expiry),
      r.premiumPerSpread == null ? "-" : formatNumber(r.premiumPerSpread, 2),
      formatRs(r.prdPremium),
      formatNumber(unwindDisplay, 2),
      formatRs(r.premiumOutflowRs),
    ];
  });
}

export function pricerTableExcelRows(rows: PricerRow[]): ExcelCell[][] {
  return rows.map((r) => {
    const expiry = parseISODate(r.maturity);
    const valuation = parseISODate(r.valuationDate);
    return [
      r.strike,
      Number.isNaN(expiry.getTime()) ? "-" : expiry,
      Number.isNaN(valuation.getTime()) ? "-" : valuation,
      deskBlank(r.optionType),
      r.spot,
      r.forwardGrowth,
      r.discountYield,
      r.volatility,
      r.volBump,
      r.bidOffer,
      r.price,
      r.sellPrice,
      r.buyPrice,
      r.delta,
    ];
  });
}

export function pricerTableRowsFlat(rows: PricerRow[]): string[][] {
  return rows.map((r) => [
    formatNumber(r.strike, 0),
    formatDeskDate(r.maturity),
    formatDeskDate(r.valuationDate),
    deskBlank(r.optionType),
    formatNumber(r.spot, 2),
    formatPct(r.forwardGrowth),
    formatPct(r.discountYield),
    formatPct(r.volatility),
    formatPct(r.volBump),
    formatPct(r.bidOffer),
    formatNumber(r.price, 2),
    formatNumber(r.sellPrice, 2),
    formatNumber(r.buyPrice, 2),
    formatNumber(r.delta, 6),
  ]);
}

function addBanner(sheet: ExcelJS.Worksheet, title: string, subtitle: string, toCol: number, rowOffset = 0) {
  return addExcelMasthead(sheet, {
    title,
    subtitle,
    eyebrow: DESK_EYEBROW,
    fromCol: 1,
    toCol,
    rowOffset,
  });
}

function addKeyValues(sheet: ExcelJS.Worksheet, startRow: number, rows: KV, toCol = 6): number {
  let r = startRow;
  rows.forEach(([label, value], i) => {
    const labelCell = sheet.getCell(r, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: EXCEL_THEME.inkSoft }, name: EXCEL_FONT };
    labelCell.fill = excelFill(EXCEL_THEME.label);
    labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    labelCell.border = excelBox;

    sheet.mergeCells(r, 2, r, toCol);
    const valueCell = sheet.getCell(r, 2);
    writeExcelCell(valueCell, value, label);
    valueCell.font = { size: 10, color: { argb: EXCEL_THEME.ink }, name: EXCEL_FONT };
    valueCell.fill = excelFill(i % 2 === 0 ? EXCEL_THEME.white : EXCEL_THEME.ivory);
    valueCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    valueCell.border = excelBox;
    for (let c = 3; c <= toCol; c++) {
      sheet.getCell(r, c).fill = excelFill(i % 2 === 0 ? EXCEL_THEME.white : EXCEL_THEME.ivory);
      sheet.getCell(r, c).border = excelBox;
    }
    sheet.getRow(r).height = 20;
    r += 1;
  });
  return r + 1;
}

function addDataTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  headers: readonly string[],
  rows: ExcelCell[][],
  groupCol = 0,
  highlightCols?: ReadonlySet<number>,
  mergeCols?: readonly number[],
): number {
  const headerRow = sheet.getRow(startRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = excelFill(EXCEL_THEME.maroonDeep);
    cell.font = { bold: true, size: 9, color: { argb: EXCEL_THEME.white }, name: EXCEL_FONT };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = excelGoldBox;
  });
  headerRow.height = 26;

  const colsToMerge = mergeCols ? [...mergeCols] : headers.map((_, i) => i);
  const spans = computeGroupedRowSpans(rows, colsToMerge, groupCol);
  rows.forEach((row, ri) => {
    const wsRow = sheet.getRow(startRow + 1 + ri);
    const base = ri % 2 === 0 ? EXCEL_THEME.white : EXCEL_THEME.ivory;
    row.forEach((value, ci) => {
      const cell = wsRow.getCell(ci + 1);
      writeExcelCell(cell, value, headers[ci]);
      cell.font = {
        size: 9,
        bold: highlightCols?.has(ci) ?? false,
        color: { argb: EXCEL_THEME.ink },
        name: EXCEL_FONT,
      };
      cell.fill = excelFill(base);
      cell.alignment = { vertical: "top", horizontal: ci === 0 ? "left" : "center", wrapText: true };
      cell.border = excelBox;
    });
    wsRow.height = 18;
  });
  spans.forEach((rowSpans, ri) => {
    rowSpans.forEach((span, ci) => {
      if (span > 1) {
        sheet.mergeCells(startRow + 1 + ri, ci + 1, startRow + ri + span, ci + 1);
      }
    });
  });

  headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...rows.map((row) => String(row[i] ?? "").length));
    sheet.getColumn(i + 1).width = Math.max(1, longest);
  });

  return startRow + 1 + rows.length + 1;
}

function addDisclaimer(sheet: ExcelJS.Worksheet, row: number, toCol: number): number {
  const spacer = row + 1;
  sheet.getRow(spacer).height = 10;

  const labelRow = spacer + 1;
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
  const cell = sheet.getCell(bodyRow, 1);
  cell.value = SCREEN_EXPORT_DISCLAIMER;
  cell.fill = excelFill(EXCEL_THEME.parchment);
  cell.font = { italic: true, size: 8, color: { argb: EXCEL_THEME.muted }, name: EXCEL_FONT };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.border = {
    left: excelThin(EXCEL_THEME.rule),
    right: excelThin(EXCEL_THEME.rule),
    bottom: excelThin(EXCEL_THEME.rule),
  };
  sheet.getRow(bodyRow).height = 62;
  return bodyRow + 1;
}

export async function buildUnwindScreenWorkbook(
  result: UnwindResult,
  options?: { logoOffset?: number },
): Promise<ExcelJS.Workbook> {
  const wb = await createWorkbook();
  const stamp = screenExportStamp();
  const subtitle = `${result.productName} · ${result.productCode} · ${stamp}`;
  const SUMMARY_COLS = 6;
  const logoOffset = options?.logoOffset ?? 0;

  const summary = wb.addWorksheet("Unwinding Summary", { views: [{ showGridLines: false }] });
  summary.columns = [
    { width: 1 },
    { width: 1 },
    { width: 1 },
    { width: 1 },
    { width: 1 },
    { width: 1 },
  ];
  let row = addBanner(summary, "Unwinding Calculator", subtitle, SUMMARY_COLS, logoOffset);
  row = addExcelSection(summary, row, "Input Parameters", 1, SUMMARY_COLS);
  row = addKeyValues(summary, row, inputRows(result), SUMMARY_COLS);
  row = addExcelSection(summary, row, "Unwind Quote and Internal Rates of Return", 1, SUMMARY_COLS);
  row = addExcelKpiTiles(summary, row, quoteRows(result), SUMMARY_COLS);
  row = addExcelSection(summary, row, "Product Facts", 1, SUMMARY_COLS);
  row = addKeyValues(summary, row, factRows(result), SUMMARY_COLS);
  row = addExcelSection(summary, row, "NBFC MIS", 1, SUMMARY_COLS);
  row = addKeyValues(summary, row, fundingRows(result), SUMMARY_COLS);
  row = addExcelSection(summary, row, "NBFC Book Values", 1, SUMMARY_COLS);
  row = addKeyValues(summary, row, rupeeRows(result), SUMMARY_COLS);
  addDisclaimer(summary, row, SUMMARY_COLS);
  autofitExcelColumns(summary);

  const book = wb.addWorksheet("Options Book", { views: [{ showGridLines: false }] });
  const bookCols = OPTION_BOOK_HEADERS.length;
  let bookRow = addBanner(book, "Options Book", subtitle, bookCols, logoOffset);
  bookRow = addExcelSection(book, bookRow, "Unwind Marks", 1, bookCols);
  bookRow = addDataTable(
    book,
    bookRow,
    OPTION_BOOK_HEADERS,
    optionBookExcelRows(result),
    1,
    undefined,
    OPTION_BOOK_MERGE_COLS,
  );
  addDisclaimer(book, bookRow, bookCols);
  autofitExcelColumns(book);
  return wb;
}

export async function buildMultiProductBookWorkbook(
  headers: readonly string[],
  rows: ExcelCell[][],
  options?: { logoOffset?: number; viewNote?: string; title?: string; sheetName?: string },
): Promise<ExcelJS.Workbook> {
  const wb = await createWorkbook();
  const stamp = screenExportStamp();
  const productCount = new Set(rows.map((row) => String(row[0] ?? ""))).size;
  const note = options?.viewNote?.trim();
  const subtitle = `${note ? `${note} · ` : ""}${productCount} Products · ${rows.length} Option Rows · Live Unwind Quotes · ${stamp}`;
  const cols = Math.max(headers.length, 1);
  const logoOffset = options?.logoOffset ?? 0;

  const ws = wb.addWorksheet(options?.sheetName?.trim() || "Product Book", { views: [{ showGridLines: false }] });
  let row = addBanner(ws, options?.title?.trim() || "Multiple Product Book", subtitle, cols, logoOffset);
  const highlightCols = new Set(
    headers.flatMap((header, index) =>
      /unwind quote|internal rate of return|premium outflow/i.test(header) ? [index] : [],
    ),
  );
  row = addExcelSection(ws, row, "Unwind Quotes And Product Facts", 1, cols);
  row = addDataTable(ws, row, headers, rows, 0, highlightCols, PRODUCT_BOOK_MERGE_COLS);
  addDisclaimer(ws, row, cols);
  autofitExcelColumns(ws);
  return wb;
}

export async function buildPricerScreenWorkbook(
  rows: PricerRow[],
  productCode: string,
  options?: { logoOffset?: number },
): Promise<ExcelJS.Workbook> {
  const wb = await createWorkbook();
  const stamp = screenExportStamp();
  const subtitle = `${productCode} · ${rows.length} Legs · ${stamp}`;
  const cols = PRICER_TABLE_HEADERS.length;
  const logoOffset = options?.logoOffset ?? 0;

  const ws = wb.addWorksheet("Pricer Table", { views: [{ showGridLines: false }] });
  let row = addBanner(ws, "Pricer Table", subtitle, cols, logoOffset);
  row = addExcelSection(ws, row, "Black Scholes Marks", 1, cols);
  row = addDataTable(ws, row, PRICER_TABLE_HEADERS, pricerTableExcelRows(rows), 0, undefined, PRICER_MERGE_COLS);
  addDisclaimer(ws, row, cols);
  autofitExcelColumns(ws);
  return wb;
}

export {
  PRODUCT_BOOK_HEADERS,
  OPTION_BOOK_HEADERS,
  PRICER_TABLE_HEADERS,
  formatRs as formatExportRs,
  inputRows as exportInputRows,
  quoteRows as exportQuoteRows,
  factRows as exportFactRows,
};
