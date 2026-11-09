/**
 * Build sample Excel input files with Anand Rathi desk branding.
 * Logo wash + masthead above the sheet. Tables stay plain: no fills inside.
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import multiSeed from "../lib/data/multi-products-seed.json";
import {
  PRODUCT_MASTER_DATE_COLS,
  PRODUCT_MASTER_EXCEL_COL as COL,
  PRODUCT_MASTER_HEADERS,
  PRODUCT_MASTER_PCT_COLS,
} from "../lib/workbook/master-columns";
import {
  DEEP_STRIKE,
  DEFAULT_SURFACE_MONTH_KEY,
  MONTHLY_REFERENCE_NIFTY,
  MONTHLY_REFERENCE_SENSEX,
} from "../lib/engine/vol-surface";
import type { VolSurface } from "../lib/types";
import { EXCEL_THEME } from "../lib/workbook/export-theme";
import {
  applySampleDeskBrand,
  styleSampleDataCell,
  styleSampleHeaderCell,
} from "./sample-branding";

const root = process.cwd();
const SURFACE_YEAR = Number(DEFAULT_SURFACE_MONTH_KEY.slice(0, 4));
const SURFACE_MONTH_NAME = new Date(
  Date.UTC(SURFACE_YEAR, Number(DEFAULT_SURFACE_MONTH_KEY.slice(5, 7)) - 1, 1),
).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
const PARAMS_SHEET = "Surface Parameters";
const outDir = path.join(root, "public/samples");
fs.mkdirSync(outDir, { recursive: true });

function colLetter(n: number): string {
  let value = n;
  let out = "";
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function paintRange(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      styleSampleDataCell(ws.getCell(r, c));
    }
  }
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  styleSampleHeaderCell(cell);
}

function styleDataCell(
  cell: ExcelJS.Cell,
  opts?: { horizontal?: ExcelJS.Alignment["horizontal"]; wrap?: boolean },
) {
  styleSampleDataCell(cell, opts);
}

function formattedNumberLength(value: number, fmt: string): number {
  if (fmt.includes("%")) return `${(value * 100).toFixed(2)}%`.length;
  if (fmt.includes("0.00")) {
    return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length;
  }
  if (fmt.includes("#,##0")) {
    return value.toLocaleString("en-IN", { maximumFractionDigits: 0 }).length;
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 }).length;
}

function cellDisplayLength(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null || v === "") return 0;
  const fmt = String(cell.numFmt ?? "");
  if (typeof v === "number") return formattedNumberLength(v, fmt);
  if (v instanceof Date || (/[dym]/i.test(fmt) && /mmm|yyyy|yy|dd/i.test(fmt))) return 12;
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((part) => part.text).join("").length;
    }
    if ("result" in v && v.result != null && typeof v.result !== "object") {
      return typeof v.result === "number" ? formattedNumberLength(v.result, fmt) : String(v.result).length;
    }
    if ("text" in v) return String((v as { text?: unknown }).text ?? "").length;
    if ("formula" in v) return 14;
  }
  return String(v).length;
}

function columnLettersToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Size columns to headers and values. Masthead banners and footer notes do not stretch the grid. */
function autoFitColumns(ws: ExcelJS.Worksheet, max = 56) {
  const dateText = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/;
  const wideMerges = new Map<string, { startCol: number; endCol: number }>();
  for (const merge of ws.model.merges ?? []) {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(String(merge));
    if (!match) continue;
    const startCol = columnLettersToNumber(match[1]!);
    const endCol = columnLettersToNumber(match[3]!);
    if (endCol > startCol) wideMerges.set(`${match[1]!.toUpperCase()}${match[2]}`, { startCol, endCol });
  }

  const lastCol = Math.max(ws.columnCount, ws.actualColumnCount || 0);
  for (let colNumber = 1; colNumber <= lastCol; colNumber += 1) {
    const col = ws.getColumn(colNumber);
    let longest = 8;
    let dateColumn = false;
    col.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged) {
        const master = cell.master ?? cell;
        if (cell.address !== master.address) return;
        const span = wideMerges.get(String(master.address).toUpperCase());
        if (span && span.endCol > span.startCol) return;
      }
      const text = typeof cell.value === "string" ? cell.value.trim() : "";
      if (colNumber === 1 && text.length > 80) return;
      if (cell.value instanceof Date) dateColumn = true;
      const fmt = String(cell.numFmt ?? "");
      if (/[dym]/i.test(fmt) && /mmm|yyyy|yy|dd/i.test(fmt)) dateColumn = true;
      if (text && (dateText.test(text) || /\bdate\b/i.test(text))) dateColumn = true;
      longest = Math.max(longest, cellDisplayLength(cell));
    });
    const floor = dateColumn ? 14 : 10;
    const pad = dateColumn ? 2 : 3;
    col.width = Math.min(max, Math.max(floor, longest + pad));
  }
}

function brandSheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  cols: number,
): number {
  return applySampleDeskBrand(wb, ws, title, subtitle, cols);
}

async function buildVolSurface() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Anand Rathi Wealth";

  const ws = wb.addWorksheet("Vol Surface", { views: [{ showGridLines: false }] });
  // Keep the moneyness grid starting at column A so SheetJS does not drop empty leading cols.
  ws.getColumn(1).width = 18;

  const surface = volSeed as VolSurface;
  const niftyRef = Number(surface.referenceUnderlyingPrice) || MONTHLY_REFERENCE_NIFTY;
  const sensexRef = Number(surface.referenceSensexPrice) || MONTHLY_REFERENCE_SENSEX;
  const fwdSellRate = Number(surface.pricingParams?.[0]?.fwdSellRate) || 0.066;
  const volBump = Number(surface.pricingParams?.[0]?.volBump) || 0;

  const gridCols = 2 + surface.moneyness.length;
  const headRow = brandSheet(
    wb,
    ws,
    `Volatility Surface Input · ${SURFACE_MONTH_NAME} ${SURFACE_YEAR}`,
    "Monthly implied volatility grid by strike and expiry. Strike rows are live formulas of Reference Nifty / Sensex × moneyness.",
    gridCols,
  );

  ws.getCell(headRow, 1).value = "Strike Change";
  styleHeaderCell(ws.getCell(headRow, 1));

  ws.getCell(headRow, 2).value = "Deep";
  for (let i = 0; i < surface.moneyness.length; i++) {
    const col = 3 + i;
    ws.getCell(headRow, col).value = surface.moneyness[i];
    ws.getCell(headRow, col).numFmt = "0%";
    ws.getColumn(col).width = 12;
  }
  ws.getColumn(2).width = 12;
  for (let c = 2; c < 3 + surface.moneyness.length; c++) {
    styleHeaderCell(ws.getCell(headRow, c));
  }
  ws.getRow(headRow).height = 16;

  const niftyStrikeRow = headRow + 1;
  const sensexStrikeRow = headRow + 2;
  const expiryHeaderRow = headRow + 3;
  const strikeRows: Array<[number, string]> = [
    [niftyStrikeRow, "Nifty Strikes"],
    [sensexStrikeRow, "Sensex Strikes"],
  ];
  for (const [row, label] of strikeRows) {
    ws.getCell(row, 1).value = label;
    styleDataCell(ws.getCell(row, 1), { horizontal: "left" });
    ws.getCell(row, 1).font = { name: "Calibri", size: 9, bold: true, color: { argb: EXCEL_THEME.ink } };
    ws.getCell(row, 2).value = DEEP_STRIKE;
    ws.getCell(row, 2).numFmt = "#,##0";
    styleDataCell(ws.getCell(row, 2));
    for (let i = 0; i < surface.moneyness.length; i++) {
      const col = 3 + i;
      styleDataCell(ws.getCell(row, col));
    }
    ws.getRow(row).height = 15;
  }

  ws.getCell(expiryHeaderRow, 1).value = "Expiry Date";
  styleDataCell(ws.getCell(expiryHeaderRow, 1), { horizontal: "left" });
  ws.getCell(expiryHeaderRow, 1).font = { name: "Calibri", size: 9, bold: true, color: { argb: EXCEL_THEME.ink } };
  for (let c = 2; c < 3 + surface.moneyness.length; c++) {
    styleDataCell(ws.getCell(expiryHeaderRow, c));
  }
  ws.getRow(expiryHeaderRow).height = 15;

  for (let r = 0; r < surface.expiries.length; r++) {
    const row = expiryHeaderRow + 1 + r;
    ws.getCell(row, 1).value = new Date(surface.expiries[r]);
    ws.getCell(row, 1).numFmt = "DD-MMM-YYYY";
    styleDataCell(ws.getCell(row, 1));
    for (let c = 0; c < surface.volsPercent[r].length; c++) {
      const cell = ws.getCell(row, 2 + c);
      cell.value = Math.round(surface.volsPercent[r][c] * 10000) / 10000;
      cell.numFmt = "0.00";
      styleDataCell(cell);
    }
    ws.getRow(row).height = 14;
  }

  const params = wb.addWorksheet(PARAMS_SHEET, { views: [{ showGridLines: false }] });
  params.getColumn(1).width = 28;
  params.getColumn(2).width = 16;
  const paramTableRow = brandSheet(
    wb,
    params,
    `Pricing Parameters · ${SURFACE_MONTH_NAME} ${SURFACE_YEAR}`,
    "Update Reference Nifty / Sensex as of the first day of the month. Strike rows on Vol Surface recalculate automatically.",
    2,
  );

  const paramRows: Array<[string, ExcelJS.CellValue, string]> = [
    ["Month", `${SURFACE_MONTH_NAME} ${SURFACE_YEAR}`, "@"],
    ["Reference Nifty Price", niftyRef, "#,##0.00"],
    ["Reference Sensex Price", sensexRef, "#,##0.00"],
    ["Volatility Bump", volBump, "0.00%"],
    ["Forward Sell Rate", fwdSellRate, "0.00%"],
  ];
  params.getCell(paramTableRow, 1).value = "Parameter";
  params.getCell(paramTableRow, 2).value = "Value";
  styleHeaderCell(params.getCell(paramTableRow, 1));
  styleHeaderCell(params.getCell(paramTableRow, 2));
  params.getRow(paramTableRow).height = 16;
  paramRows.forEach(([label, value, fmt], i) => {
    const r = paramTableRow + 1 + i;
    params.getCell(r, 1).value = label;
    params.getCell(r, 2).value = value;
    params.getCell(r, 2).numFmt = fmt;
    styleDataCell(params.getCell(r, 1), { horizontal: "left" });
    styleDataCell(params.getCell(r, 2));
    params.getRow(r).height = 14;
  });
  const niftyRefRow = paramTableRow + 2; // Month, then Reference Nifty
  const sensexRefRow = paramTableRow + 3;

  // Bind strike formulas now that parameter rows are known.
  for (let i = 0; i < surface.moneyness.length; i++) {
    const col = 3 + i;
    const moneyAddr = `${colLetter(col)}${headRow}`;
    const niftyCell = ws.getCell(niftyStrikeRow, col);
    niftyCell.value = {
      formula: `'${PARAMS_SHEET}'!$B$${niftyRefRow}*${moneyAddr}`,
      result: surface.moneyness[i] * niftyRef,
    };
    niftyCell.numFmt = "#,##0.00";
    styleDataCell(niftyCell);
    const sensexCell = ws.getCell(sensexStrikeRow, col);
    sensexCell.value = {
      formula: `'${PARAMS_SHEET}'!$B$${sensexRefRow}*${moneyAddr}`,
      result: surface.moneyness[i] * sensexRef,
    };
    sensexCell.numFmt = "#,##0.00";
    styleDataCell(sensexCell);
  }

  autoFitColumns(ws, 18);
  autoFitColumns(params, 36);
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 18, 18);

  const out = path.join(outDir, `Vol_Surface_Input_${SURFACE_MONTH_NAME}.xlsx`);
  await wb.xlsx.writeFile(out);
  // Remove earlier months' samples so downloads never point at a stale surface.
  for (const name of fs.readdirSync(outDir)) {
    const stale = path.join(outDir, name);
    if (/^Vol_Surface_Input_.+\.xlsx$/.test(name) && stale !== out) fs.unlinkSync(stale);
  }
  console.log("Wrote", out);
}

type SeedLeg = {
  optionType: string;
  strike: number;
  spreads: number;
  originalSide: string;
  expiry: string;
  reqQuantity: number;
  prdPrice?: number;
};

async function buildProductMaster() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Anand Rathi Wealth";
  const ws = wb.addWorksheet("Product Master", { views: [{ showGridLines: false }] });
  const HEAD_ROW = brandSheet(
    wb,
    ws,
    "Product Master Input · Nifty Accelerator 961",
    "Same 28 columns as Multiple Product Master · repeated values shown once",
    PRODUCT_MASTER_HEADERS.length,
  );
  const DATA_START = HEAD_ROW + 1;

  const p = productSeed as Record<string, unknown> & {
    legs: SeedLeg[];
    contingentLevel?: number;
    marginCost?: number;
  };

  const headers = [...PRODUCT_MASTER_HEADERS];
  const legs = p.legs;
  const dataEnd = DATA_START + legs.length - 1;

  headers.forEach((h, i) => {
    const cell = ws.getCell(HEAD_ROW, i + 1);
    cell.value = h;
    styleHeaderCell(cell);
    ws.getColumn(i + 1).width = Math.max(12, h.length + 3);
  });
  ws.getColumn(COL.formulae).width = 48;
  ws.getRow(HEAD_ROW).height = 28;
  ws.views = [{ state: "frozen", ySplit: HEAD_ROW, showGridLines: false }];

  const contingent =
    Number(p.contingentLevel) > 0 ? Number(p.contingentLevel) : Number(p.initialNiftyLevel);
  const productValues: Array<[number, ExcelJS.CellValue, string | null]> = [
    [COL.productName, String(p.productName), null],
    [COL.tradeDate, new Date(String(p.tradeDate)), "DD-MMM-YYYY"],
    [COL.productCode, String(p.productCode), null],
    [COL.mobilization, Number(p.mobilization), "#,##0"],
    [COL.unwinds, Number(p.unwinds), "#,##0"],
    [COL.initialNiftyLevel, Number(p.initialNiftyLevel), "#,##0"],
    [COL.contingentLevel, contingent, "#,##0"],
    [COL.allotmentDate, new Date(String(p.allotmentDate)), "DD-MMM-YYYY"],
    [
      COL.tenorDays,
      {
        formula: `$${colLetter(COL.maturityDate)}$${DATA_START}-$${colLetter(COL.allotmentDate)}$${DATA_START}`,
        result: Number(p.tenorDays),
      },
      "#,##0",
    ],
    [COL.maturityDate, new Date(String(p.maturityDate)), "DD-MMM-YYYY"],
    [COL.prdDiscRate, Number(p.prdDiscRate), "0.00%"],
    [COL.premDiscRate, Number(p.premDiscRate), "0.00%"],
    [COL.formulae, String(p.formulae), null],
    [COL.coupon, Number(p.coupon), "0.00%"],
    [COL.inbuilt, Number(p.inbuilt), "0.00%"],
    [COL.tranCost, Number(p.tranCost), "0.00%"],
    [COL.issuanceCost, Number(p.issuanceCost), "0.00%"],
    [COL.marginCost, Number(p.marginCost ?? 0), "0.00%"],
    [COL.faceValue, Number(p.faceValue), "#,##0"],
    [COL.totalFundsForMargin, Number(p.totalFundsForMargin), "#,##0.00"],
    [COL.marginFundingRate, Number(p.marginFundingRate), "0.00%"],
  ];

  // Product-level columns: merged once across all leg rows
  for (const [col, value, fmt] of productValues) {
    ws.mergeCells(DATA_START, col, dataEnd, col);
    const cell = ws.getCell(DATA_START, col);
    cell.value = value;
    if (fmt) cell.numFmt = fmt;
    styleDataCell(cell, {
      horizontal: col === COL.formulae ? "left" : "center",
      wrap: col === COL.formulae,
    });
    paintRange(ws, DATA_START, col, dataEnd, col);
  }

  // Leg rows — merge Option Type / Strike / Spreads / Side per 4-expiry group
  legs.forEach((leg, i) => {
    const r = DATA_START + i;
    const groupStart = DATA_START + Math.floor(i / 4) * 4;
    ws.getRow(r).height = 14;

    if (i % 4 === 0) {
      const groupEnd = Math.min(groupStart + 3, dataEnd);
      const groupCols: Array<[number, ExcelJS.CellValue, string | null]> = [
        [COL.optionType, leg.optionType, null],
        [COL.strike, leg.strike, "#,##0"],
        [COL.spreads, leg.spreads, "#,##0.000"],
        [COL.originalSide, leg.originalSide, null],
      ];
      for (const [col, value, fmt] of groupCols) {
        ws.mergeCells(groupStart, col, groupEnd, col);
        const cell = ws.getCell(groupStart, col);
        cell.value = value;
        if (fmt) cell.numFmt = fmt;
        styleDataCell(cell);
        paintRange(ws, groupStart, col, groupEnd, col);
      }
    }

    // Per-row: Expiry (date) + Required Quantity as a live Excel formula
    const expiryCell = ws.getCell(r, COL.expiry);
    expiryCell.value = new Date(leg.expiry);
    expiryCell.numFmt = "DD-MMM-YYYY";
    styleDataCell(expiryCell);

    const qtyCell = ws.getCell(r, COL.reqQuantity);
    // Keep full seed precision in the cached formula result so upload round-trips
    // match Atlas/seed quotes; numFmt only affects display.
    qtyCell.value = {
      formula: `IF($${colLetter(COL.originalSide)}$${groupStart}="Sell",-1,1)*$${colLetter(COL.spreads)}$${groupStart}*$${colLetter(COL.mobilization)}$${DATA_START}/$${colLetter(COL.initialNiftyLevel)}$${DATA_START}/4`,
      result: leg.reqQuantity,
    };
    qtyCell.numFmt = "#,##0.00";
    styleDataCell(qtyCell);

    // Product Price is per leg — each expiry carries its own initial mark
    const priceCell = ws.getCell(r, COL.prdPrice);
    priceCell.value = leg.prdPrice != null ? leg.prdPrice : null;
    priceCell.numFmt = "#,##0.00";
    styleDataCell(priceCell, { horizontal: "right" });
  });

  const noteRow = dataEnd + 2;
  ws.getCell(noteRow, 1).value =
    "Same 28 input columns as the Multiple Product Master. Required Quantity is a live formula of Spreads, Mobilization and Initial Underlying Level. Derived columns are recomputed by the engine.";
  ws.getCell(noteRow, 1).font = { italic: true, color: { argb: EXCEL_THEME.muted }, size: 9, name: "Calibri" };

  const out = path.join(outDir, "Product_Master_Input_Nifty_Accelerator_961.xlsx");
  autoFitColumns(ws);
  ws.getColumn(COL.formulae).width = Math.max(ws.getColumn(COL.formulae).width ?? 46, 46);
  await wb.xlsx.writeFile(out);
  console.log("Wrote", out);
}

const MULTI_HEADERS = PRODUCT_MASTER_HEADERS;

type MultiSeedProduct = {
  productName: string;
  productCode: string;
  tradeDate: string;
  allotmentDate: string;
  maturityDate: string;
  tenorDays: number;
  mobilization: number;
  unwinds: number;
  initialNiftyLevel: number;
  contingentLevel?: number;
  prdDiscRate: number;
  premDiscRate: number;
  formulae: string;
  coupon: number;
  inbuilt: number;
  tranCost: number;
  issuanceCost: number;
  marginCost?: number;
  faceValue: number;
  totalFundsForMargin: number;
  marginFundingRate: number;
  prdPrice: number;
  legs: SeedLeg[];
};

function toExcelDate(iso: string): Date {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function paintMasterHeaders(ws: ExcelJS.Worksheet, headers: readonly string[], headRow: number) {
  headers.forEach((header, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = header;
    styleHeaderCell(cell);
    ws.getColumn(i + 1).width = Math.max(12, header.length + 3);
  });
  ws.getColumn(1).width = Math.max(18, "Product Name".length + 3);
  ws.getColumn(COL.formulae).width = 48;
  ws.getRow(headRow).height = 28;
  ws.views = [{ state: "frozen", ySplit: headRow, showGridLines: false }];
}

function sameStrikeGroup(a: SeedLeg, b: SeedLeg): boolean {
  return (
    a.optionType === b.optionType &&
    a.strike === b.strike &&
    a.spreads === b.spreads &&
    a.originalSide === b.originalSide
  );
}

function displayWidthForMasterValue(colIndex: number, value: string | number | Date | null): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) return 12;
  if (typeof value === "number") {
    if (PRODUCT_MASTER_DATE_COLS.has(colIndex)) return 12;
    if (PRODUCT_MASTER_PCT_COLS.has(colIndex)) return `${(value * 100).toFixed(2)}%`.length;
    if (colIndex === COL.reqQuantity - 1 || colIndex === COL.prdPrice - 1 || colIndex === COL.spreads - 1) {
      return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length;
    }
    return value.toLocaleString("en-IN", { maximumFractionDigits: 2 }).length;
  }
  return String(value).length;
}

async function brandMultiSampleFile(
  filePath: string,
  title: string,
  subtitle: string,
  columnWidths: number[],
): Promise<void> {
  const started = Date.now();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No sheet in ${filePath}`);

  let headRow = -1;
  for (let r = 1; r <= 40; r += 1) {
    const label = String(ws.getCell(r, 1).value ?? "")
      .trim()
      .toLowerCase();
    if (label === "product name" || label.startsWith("product name")) {
      headRow = r;
      break;
    }
  }
  if (headRow < 0) throw new Error(`Product Name header not found in ${filePath}`);

  const cols = Math.max(ws.columnCount || 0, PRODUCT_MASTER_HEADERS.length, 28);
  const brandRows = 8;
  ws.spliceRows(1, 0, ...Array.from({ length: brandRows }, () => []));
  headRow += brandRows;

  for (let r = 1; r < headRow; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      const cell = ws.getCell(r, c);
      cell.value = null;
      cell.fill = { type: "pattern", pattern: "none" };
      cell.font = { name: "Calibri" };
      cell.border = {};
      cell.alignment = {};
    }
  }

  applySampleDeskBrand(wb, ws, title, subtitle, cols);

  for (let c = 1; c <= cols; c += 1) {
    const cell = ws.getCell(headRow, c);
    if (cell.value == null || cell.value === "") continue;
    styleSampleHeaderCell(cell);
  }
  ws.getRow(headRow).height = 28;
  ws.views = [{ state: "frozen", ySplit: headRow, showGridLines: false }];
  columnWidths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  wb.creator = "Anand Rathi Wealth";

  await wb.xlsx.writeFile(filePath);
  console.log(
    "Branded",
    path.basename(filePath),
    `${Date.now() - started}ms`,
    fs.statSync(filePath).size,
    `header@${headRow}`,
    "table=plain",
  );
}

async function buildMultiProductMaster(filename: string, repeatValuesPerRow: boolean) {
  const products = multiSeed as MultiSeedProduct[];
  const legTotal = products.reduce((sum, item) => sum + item.legs.length, 0);
  console.log(`Building ${filename} (${products.length} products / ${legTotal} legs)…`);

  // Title block starts at AOA row 0 (no leading blank — SheetJS drops empty leading rows).
  // Branding (logo + maroon/gold masthead) is applied after write via ExcelJS.
  const columnWidths = PRODUCT_MASTER_HEADERS.map((header, index) => {
    const dateCol = PRODUCT_MASTER_DATE_COLS.has(index);
    return Math.max(dateCol ? 14 : 12, header.length + 3);
  });
  columnWidths[COL.formulae - 1] = 48;

  const aoa: (string | number | Date | null)[][] = [];
  aoa.push([null, null, "Product Master Input · Multiple Products"]);
  aoa.push([
    null,
    null,
    `${products.length} products · ${legTotal} legs · ${
      repeatValuesPerRow ? "repeated values on every row" : "product facts on first leg row (parser fills down)"
    }`,
  ]);
  aoa.push([]);
  aoa.push([]);
  aoa.push([]);
  aoa.push([...MULTI_HEADERS]);

  for (const product of products) {
    const legs = product.legs;
    if (!legs.length) continue;
    const contingent =
      product.contingentLevel && product.contingentLevel > 0
        ? product.contingentLevel
        : product.initialNiftyLevel;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const first = i === 0;
      const showProduct = repeatValuesPerRow || first;
      const prev = i > 0 ? legs[i - 1] : null;
      const showGroup = repeatValuesPerRow || !prev || !sameStrikeGroup(prev, leg);
      const row = Array<string | number | Date | null>(MULTI_HEADERS.length).fill(null);
      if (showProduct) {
        row[COL.productName - 1] = product.productName;
        row[COL.tradeDate - 1] = toExcelDate(product.tradeDate);
        row[COL.productCode - 1] = product.productCode;
        row[COL.mobilization - 1] = product.mobilization;
        row[COL.unwinds - 1] = product.unwinds;
        row[COL.initialNiftyLevel - 1] = product.initialNiftyLevel;
        row[COL.contingentLevel - 1] = contingent;
        row[COL.allotmentDate - 1] = toExcelDate(product.allotmentDate);
        row[COL.tenorDays - 1] = product.tenorDays;
        row[COL.maturityDate - 1] = toExcelDate(product.maturityDate);
        row[COL.prdDiscRate - 1] = product.prdDiscRate;
        row[COL.premDiscRate - 1] = product.premDiscRate;
        row[COL.formulae - 1] = product.formulae;
        row[COL.coupon - 1] = product.coupon;
        row[COL.inbuilt - 1] = product.inbuilt;
        row[COL.tranCost - 1] = product.tranCost;
        row[COL.issuanceCost - 1] = product.issuanceCost;
        row[COL.marginCost - 1] = product.marginCost ?? 0;
        row[COL.faceValue - 1] = product.faceValue;
        row[COL.totalFundsForMargin - 1] = product.totalFundsForMargin;
        row[COL.marginFundingRate - 1] = product.marginFundingRate;
      }
      if (showGroup) {
        row[COL.optionType - 1] = leg.optionType;
        row[COL.strike - 1] = leg.strike;
        row[COL.spreads - 1] = leg.spreads;
        row[COL.originalSide - 1] = leg.originalSide;
      }
      row[COL.expiry - 1] = toExcelDate(leg.expiry);
      row[COL.reqQuantity - 1] = leg.reqQuantity ?? 0;
      row[COL.prdPrice - 1] = leg.prdPrice != null ? leg.prdPrice : product.prdPrice;
      row.forEach((value, colIndex) => {
        const measured = displayWidthForMasterValue(colIndex, value);
        if (measured <= 0) return;
        const cap = colIndex === COL.formulae - 1 ? 48 : 42;
        columnWidths[colIndex] = Math.max(columnWidths[colIndex] ?? 12, Math.min(cap, measured + 3));
      });
      aoa.push(row);
    }
  }

  aoa.push([]);
  aoa.push([
    repeatValuesPerRow
      ? "Required Quantity is the signed Product Master quantity for each leg. Product-level values repeat on every row in this version. Derived columns are recomputed by the engine."
      : "Required Quantity is the signed Product Master quantity for each leg. Product-level values are shown once; the parser fills them down. Derived columns are recomputed by the engine.",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const xwb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(xwb, sheet, "Product Master");
  const out = path.join(outDir, filename);
  XLSX.writeFile(xwb, out);
  console.log("Wrote", out, fs.statSync(out).size);

  await brandMultiSampleFile(
    out,
    "Product Master Input · Multiple Products",
    `${products.length} products · ${legTotal} legs · ${
      repeatValuesPerRow
        ? "Repeated values on every row · Anand Rathi Wealth sample"
        : "Product facts on first leg row · Anand Rathi Wealth sample"
    }`,
    columnWidths,
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const repeatedOnly = args.has("--repeated-only");
  if (args.has("--vol-only")) {
    await buildVolSurface();
    return;
  }
  if (!repeatedOnly) {
    await buildVolSurface();
    await buildProductMaster();
    await buildMultiProductMaster("Product_Master_Input_Multiple_Products.xlsx", false);
  }
  await buildMultiProductMaster("Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx", true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
