"use client";

import type ExcelJS from "exceljs";
import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import { OPTION_BOOK_HEADERS } from "@/lib/workbook/export-columns";
import {
  SCREEN_EXPORT_DISCLAIMER,
  buildMultiProductBookWorkbook,
  buildUnwindScreenWorkbook,
  exportInputRows,
  optionBookRowsFlat,
} from "@/lib/workbook/build-screen-excel";
import type { AmExportDoc, AmTable, AmValue } from "@/lib/workbook/am-export-columns";
import { createWorkbook } from "@/lib/workbook/excel-runtime";
import { unwindProductFactRows } from "@/lib/workbook/product-facts";
import { loadAutoTable, loadJsPdf } from "@/lib/workbook/pdf-runtime";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  PDF_THEME,
  addExcelKpiTiles,
  addExcelMasthead,
  addExcelSection,
  autofitExcelColumns,
  excelBox,
  excelFill,
  excelGoldBox,
  excelThin,
} from "@/lib/workbook/export-theme";
import { writeExcelCell, type ExcelCell } from "@/lib/workbook/excel-cells";
import type { UnwindResult } from "@/lib/types";
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
} from "@/lib/utils";
import { spannedPdfBody } from "@/lib/workbook/pdf-table";
import { OPTION_BOOK_MERGE_COLS } from "@/lib/workbook/table-merge";

export { SCREEN_EXPORT_DISCLAIMER };

const DESK_EYEBROW = "Anand Rathi Wealth · Active Management Dashboard";
const DESK_FOOTER = "Active Management Dashboard · Confidential";

type KV = Array<[string, string]>;
type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;
type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function formatRs(v: number): string {
  return formatDeskRupees(v);
}

function pdfSafeText(value: string): string {
  return String(value ?? "")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function screenExportStamp() {
  return `Generated ${formatDeskDateFull(deskTodayISO())}`;
}

/* ── Section builders shared by Excel and PDF ─────────────────────────── */

function inputRows(result: UnwindResult): KV {
  return [
    ["Product Name", result.productName],
    ["Product Code", result.productCode],
    ["Underlying", result.underlying || "—"],
    ["Number of Debentures", formatNumber(result.debentures, 0)],
    ["Unwinding Date", formatDeskDate(result.unwindDate)],
    ["Bid Ask Spread", result.bidAskSpread == null ? "As Per Bid Ask Table" : formatPct(result.bidAskSpread)],
    ["Underlying Spot Level", formatNumber(result.spot, 2)],
  ];
}

function quoteRows(result: UnwindResult): KV {
  return [
    ["Unwind Quote Percent", formatPct(result.unwindQuotePct)],
    ["Unwind Quote Amount", formatRs(result.unwindQuoteRs)],
    ["Product Internal Rate of Return", formatPct(result.productIRR)],
    ["Client Internal Rate of Return", formatPct(capAtProductIrr(result.clientIRR, result.productIRR))],
    ["Residual Internal Rate of Return", formatPct(capAtProductIrr(result.residualIRR, result.productIRR))],
  ];
}

function factRows(result: UnwindResult): KV {
  return unwindProductFactRows(result);
}

function fundingRows(result: UnwindResult): KV {
  return [
    ["Total Debentures in Issue", formatNumber(result.totalDebs, 0)],
    ["Amount with NBFC Percent", formatPct(result.amountWithNbfc)],
    ["NBFC Grown Value Percent", formatPct(result.nbfcGrownValue)],
    ["Premium Credited Percent", formatPct(result.premium)],
    ["Premium Grown Value Percent", formatPct(result.premiumGrownValue)],
    ["Current Premium Outflow Percent", formatPct(result.currentPremOutflowPct)],
  ];
}

function rupeeRows(result: UnwindResult): KV {
  return [
    ["Amount with NBFC Rupees", formatRs(result.masterEconomics.amtWithNbfcRs)],
    ["NBFC Grown Value Rupees", formatRs(result.masterEconomics.grownValueRs)],
    ["Premium Credited", formatRs(result.masterEconomics.premiumCreditedRs)],
    ["Premium Grown Value Rupees", formatRs(result.masterEconomics.premGrownValueRs)],
    ["Premium Outflow", formatRs(result.masterEconomics.premiumOutflowRs)],
    ["Unwind Value", formatRs(result.masterEconomics.unwindValueRs)],
    ["Book Unwind Per Debenture", formatRs(result.masterEconomics.unwindQuoteRs)],
  ];
}

const OPTION_HEADERS = OPTION_BOOK_HEADERS;

function optionRowsFlat(result: UnwindResult): string[][] {
  return optionBookRowsFlat(result).map((row) => row.map(pdfSafeText));
}

/* ── Excel helpers ────────────────────────────────────────────────────── */

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
    valueCell.value = value;
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
  headers: string[],
  rows: string[][],
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
      cell.value = value;
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

function usedColumnCount(sheet: ExcelJS.Worksheet): number {
  let last = 1;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const col = Number(cell.col);
      if (Number.isFinite(col) && col > last) last = col;
    });
  });
  return last;
}

function lockPrintLayout(sheet: ExcelJS.Worksheet, fitHeight: number) {
  const lastRow = sheet.lastRow?.number ?? 1;
  const lastCol = usedColumnCount(sheet);
  const endLetter = sheet.getColumn(lastCol).letter;
  const landscape = lastCol > 8;
  sheet.views = [{ showGridLines: false, state: "normal" }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: Math.max(1, fitHeight),
    horizontalCentered: true,
    verticalCentered: false,
    showGridLines: false,
    printArea: `A1:${endLetter}${lastRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = {
    oddFooter: `&LActive Management Dashboard · Anand Rathi Wealth&CPage &P of &N&R${DESK_FOOTER}`,
  };
  sheet.pageSetup.fitToPage = true;
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  if (typeof document === "undefined") {
    throw new Error("Excel download is only available in the browser.");
  }
  for (const sheet of wb.worksheets) {
    const tableSheet = /options|pricer|product book/i.test(sheet.name);
    lockPrintLayout(sheet, tableSheet ? 1 : 2);
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/**
 * The Unwinding Calculator's workbook: Unwinding Summary and Options Book, then one sheet for each
 * Active Management tab passed in (Active Management, Pricer Table, Scenario Grid), each laid out
 * as its own tab download. Node-safe; downloadUnwindScreenExcel adds the logo and saves it.
 */
export async function buildUnwindPageWorkbook(result: UnwindResult, tabs: AmExportDoc[], logoOffset = 0) {
  const wb = await buildUnwindScreenWorkbook(result, { logoOffset });
  for (const doc of tabs) addActiveManagementSheet(wb, doc, result, logoOffset);
  return wb;
}

export async function downloadUnwindScreenExcel(result: UnwindResult, tabs: AmExportDoc[] = []) {
  const logo = await fetchBrandLogoBase64();
  const logoOffset = logo ? 3 : 0;
  const wb = await buildUnwindPageWorkbook(result, tabs, logoOffset);
  if (logo) {
    for (const sheet of wb.worksheets) {
      embedBrandLogo(wb, sheet, logo, Math.max(sheet.columnCount || 6, 6));
    }
  }
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: "Unwinding-Calculator",
      productCode: result.productCode,
      productName: result.productName,
      extension: "xlsx",
    }),
  );
}

export async function downloadMultiProductBookExcel(
  headers: string[],
  rows: ExcelCell[][],
  file?: { productName?: string; viewNote?: string; title?: string; sheetName?: string },
) {
  const logo = await fetchBrandLogoBase64();
  const logoOffset = logo ? 3 : 0;
  const wb = await buildMultiProductBookWorkbook(headers, rows, {
    logoOffset,
    viewNote: file?.viewNote,
    title: file?.title,
    sheetName: file?.sheetName,
  });
  if (logo) {
    const sheet = wb.worksheets[0];
    if (sheet) embedBrandLogo(wb, sheet, logo, Math.max(headers.length, 1));
  }
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: "Multiple-Product-Book",
      productName: file?.productName ?? "All-Products",
      extension: "xlsx",
    }),
  );
}

/* ── PDF builder — same Primary SP chrome ─────────────────────────────── */

const MARGIN = 14;

class ScreenPdfBuilder {
  private readonly doc: JsPdfWithAutoTable;
  private readonly autoTable: AutoTableFn;
  private y = MARGIN;
  private contentWidth: number;

  constructor(doc: jsPDF, autoTable: AutoTableFn) {
    this.doc = doc as JsPdfWithAutoTable;
    this.autoTable = autoTable;
    this.contentWidth = doc.internal.pageSize.getWidth() - MARGIN * 2;
  }

  private pageBottom() {
    return this.doc.internal.pageSize.getHeight() - 18;
  }

  private footerY() {
    return this.doc.internal.pageSize.getHeight() - 10;
  }

  setDocumentProperties(options: { title?: string; subject?: string }) {
    this.doc.setProperties({
      title: options.title ?? "Active Management Dashboard",
      subject: options.subject ?? "Desk screen export",
      creator: "Active Management Dashboard · Anand Rathi Wealth",
    });
  }

  private ensureSpace(mm: number) {
    if (this.y + mm > this.pageBottom()) {
      this.doc.addPage();
      this.contentWidth = this.doc.internal.pageSize.getWidth() - MARGIN * 2;
      this.y = MARGIN;
    }
  }

  /**
   * Start a fresh A4 page in this orientation. jsPDF keeps it for every later addPage, so a
   * table that runs on, and its autoTable continuation pages, stay in it too.
   */
  newPage(orientation: "portrait" | "landscape") {
    this.doc.addPage("a4", orientation);
    this.contentWidth = this.doc.internal.pageSize.getWidth() - MARGIN * 2;
    this.y = MARGIN;
  }

  async addLogo() {
    const logo = await fetchBrandLogoBase64();
    const pageW = this.doc.internal.pageSize.getWidth();

    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.rect(0, 0, pageW, 18, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.6);
    this.doc.line(0, 18, pageW, 18);

    if (logo) {
      try {
        this.doc.addImage(`data:image/png;base64,${logo}`, "PNG", MARGIN, 4, 46, 10);
      } catch {
        // Logo optional
      }
    }
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text("Active Management Dashboard", pageW - MARGIN, 7.5, { align: "right" });
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text(screenExportStamp(), pageW - MARGIN, 12.5, { align: "right" });
    this.y = 22;
  }

  addBanner(title: string, subtitle: string) {
    this.ensureSpace(40);
    const w = this.contentWidth;

    this.doc.setFillColor(...PDF_THEME.gold);
    this.doc.rect(MARGIN, this.y, w, 1.4, "F");
    this.y += 1.4;

    this.doc.setFillColor(...PDF_THEME.maroonDeep);
    this.doc.rect(MARGIN, this.y, w, 13, "F");
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(pdfSafeText(title), MARGIN + 4.5, this.y + 8.5);
    this.y += 13;

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    const subLines = this.doc.splitTextToSize(pdfSafeText(subtitle), w - 9) as string[];
    const subH = Math.max(9, 4.4 + subLines.length * 3.6);
    this.doc.setFillColor(...PDF_THEME.gold);
    this.doc.rect(MARGIN, this.y, w, subH, "F");
    this.doc.setTextColor(...PDF_THEME.ink);
    this.doc.text(subLines, MARGIN + 4.5, this.y + 5.6);
    this.y += subH;

    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.5);
    const confLines = this.doc.splitTextToSize(
      "Anand Rathi Wealth  ·  Confidential desk report",
      w - 9,
    ) as string[];
    const confH = Math.max(6.4, 3.6 + confLines.length * 3.2);
    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.rect(MARGIN, this.y, w, confH, "F");
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text(confLines, MARGIN + 4.5, this.y + 4.2);
    this.y += confH + 2;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addProductHero(name: string, meta: string) {
    this.ensureSpace(20);
    const w = this.contentWidth;

    this.doc.setFillColor(...PDF_THEME.ivory);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.35);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "S");

    this.doc.setFillColor(...PDF_THEME.maroon);
    this.doc.rect(MARGIN, this.y, 1.6, 16, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...PDF_THEME.maroonDeep);
    this.doc.text(pdfSafeText(name), MARGIN + 5, this.y + 6);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text(pdfSafeText(meta), MARGIN + 5, this.y + 12);

    this.y += 18;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addKpiHighlightTable(rows: KV) {
    if (rows.length === 0) return;
    const colGap = 2.5;
    const colW = (this.contentWidth - colGap) / 2;
    const cellH = 12;
    const rowGap = 2.4;

    let yCursor = this.y;
    for (let i = 0; i < rows.length; i += 2) {
      const left = rows[i]!;
      const right = rows[i + 1];
      const solo = right == null;
      this.ensureSpace(cellH + rowGap + 2);
      yCursor = this.y;

      const drawCard = (label: string, value: string, x: number, w: number) => {
        this.doc.setFillColor(...PDF_THEME.goldPale);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "F");
        this.doc.setDrawColor(...PDF_THEME.gold);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "S");
        this.doc.setFillColor(...PDF_THEME.maroon);
        this.doc.rect(x, yCursor, 1.5, cellH, "F");

        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(6);
        this.doc.setTextColor(...PDF_THEME.muted);
        this.doc.text(pdfSafeText(label).toUpperCase(), x + 4, yCursor + 4.4);

        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(11);
        this.doc.setTextColor(...PDF_THEME.maroonDeep);
        this.doc.text(pdfSafeText(value), x + 4, yCursor + 9.2);
      };

      if (solo) {
        drawCard(left[0], left[1], MARGIN, this.contentWidth);
      } else {
        drawCard(left[0], left[1], MARGIN, colW);
        drawCard(right[0], right[1], MARGIN + colW + colGap, colW);
      }
      this.y = yCursor + cellH + rowGap;
    }
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addSection(title: string) {
    this.ensureSpace(12);
    this.doc.setFillColor(...PDF_THEME.goldSoft);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, 8, 1.1, 1.1, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.2);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, 8, 1.1, 1.1, "S");
    this.doc.setFillColor(...PDF_THEME.maroon);
    this.doc.rect(MARGIN, this.y, 1.8, 8, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text(title.toUpperCase(), MARGIN + 4.5, this.y + 5.2);
    this.y += 9.5;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  private syncYFromTable() {
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 1.5;
  }

  addKeyValueTable(rows: KV) {
    if (rows.length === 0) return;
    const labelWidth = 62;
    const valueWidth = this.contentWidth - labelWidth;
    const body = rows.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]);

    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "grid",
      rowPageBreak: "avoid",
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
        textColor: PDF_THEME.ink,
        lineColor: PDF_THEME.border,
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 5,
      },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: PDF_THEME.label, cellWidth: labelWidth },
        1: { cellWidth: valueWidth, fontStyle: "bold", halign: "left" },
      },
      alternateRowStyles: { fillColor: PDF_THEME.ivory },
    });
    this.syncYFromTable();
  }

  addDataTable(
    headers: string[],
    rows: string[][],
    fontSize = 6.2,
    groupCol = 0,
    mergeCols?: readonly number[],
  ) {
    this.autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
      tableWidth: this.contentWidth,
      head: [headers.map(pdfSafeText)],
      body: spannedPdfBody(rows, groupCol, pdfSafeText, mergeCols),
      theme: "grid",
      showHead: "everyPage",
      pageBreak: "auto",
      rowPageBreak: "avoid",
      horizontalPageBreak: false,
      headStyles: {
        fillColor: PDF_THEME.maroonDeep,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: Math.max(5.4, fontSize - 0.4),
        lineColor: PDF_THEME.gold,
        lineWidth: 0.25,
        halign: "center",
        valign: "middle",
        cellPadding: { top: 1.1, right: 0.8, bottom: 1.1, left: 0.8 },
        overflow: "linebreak",
      },
      styles: {
        fontSize,
        cellPadding: { top: 0.85, right: 0.7, bottom: 0.85, left: 0.7 },
        textColor: PDF_THEME.ink,
        lineColor: PDF_THEME.border,
        lineWidth: 0.12,
        overflow: "linebreak",
        valign: "middle",
        halign: "center",
        minCellHeight: 4.4,
      },
      columnStyles: { 0: { halign: "left" } },
      alternateRowStyles: { fillColor: PDF_THEME.ivory },
    });
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 3;
  }

  addDisclaimer() {
    const lines = this.doc.splitTextToSize(SCREEN_EXPORT_DISCLAIMER, this.contentWidth - 12) as string[];
    const blockHeight = lines.length * 3.1 + 10;
    if (this.pageBottom() - this.y < blockHeight + 2) {
      this.ensureSpace(blockHeight + 2);
    }

    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.4);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, blockHeight - 2, 1.2, 1.2, "FD");

    this.doc.setFillColor(...PDF_THEME.maroon);
    this.doc.rect(MARGIN + 1, this.y + 1, this.contentWidth - 2, 0.7, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text("DISCLAIMER", MARGIN + 4.5, this.y + 5.5);

    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.4);
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text(lines, MARGIN + 4.5, this.y + 9.5);
    this.y += blockHeight;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  private addFooters() {
    const total = this.doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      this.doc.setPage(page);
      const pageW = this.doc.internal.pageSize.getWidth();
      const fy = this.doc.internal.pageSize.getHeight() - 10;
      this.doc.setDrawColor(...PDF_THEME.gold);
      this.doc.setLineWidth(0.55);
      this.doc.line(MARGIN, fy - 2.5, pageW - MARGIN, fy - 2.5);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(6.2);
      this.doc.setTextColor(...PDF_THEME.maroon);
      this.doc.text("Anand Rathi Wealth", MARGIN, fy + 2.2);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...PDF_THEME.muted);
      this.doc.text(DESK_FOOTER, MARGIN + 32, fy + 2.2);
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...PDF_THEME.maroon);
      this.doc.text(`${page} / ${total}`, pageW - MARGIN, fy + 2.2, { align: "right" });
    }
  }

  private dropTrailingBlankPage() {
    const pages = this.doc.getNumberOfPages();
    if (pages < 2) return;
    const lastH = this.doc.internal.pageSize.getHeight();
    // A trailing page whose cursor never left the top margin was opened by a
    // page-break and never received a table body or disclaimer.
    if (this.y <= MARGIN + 2 && this.doc.getCurrentPageInfo().pageNumber === pages) {
      this.doc.deletePage(pages);
      this.doc.setPage(pages - 1);
      this.y = lastH - 24;
    }
  }

  /** Drop a blank trailing page and add the page footers; the document is then complete. */
  finish(): jsPDF {
    this.dropTrailingBlankPage();
    this.addFooters();
    return this.doc;
  }

  save(filename: string) {
    if (typeof document === "undefined") {
      throw new Error("PDF download is only available in the browser.");
    }
    const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    this.finish().save(name);
  }
}

async function createScreenPdf(orientation: "portrait" | "landscape" = "portrait") {
  const [{ jsPDF }, autoTableMod] = await Promise.all([loadJsPdf(), loadAutoTable()]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation });
  return new ScreenPdfBuilder(doc, autoTableMod.default);
}

/**
 * The Unwinding Calculator's PDF: Input Parameters and the four summary tabs, then each Active
 * Management tab passed in on its own pages (Pricer Table and Scenario Grid landscape), then the
 * disclaimer. The opening Input Parameters serve every tab, so they are not repeated. Node-safe;
 * downloadUnwindScreenPdf saves it.
 */
export async function buildUnwindScreenPdf(result: UnwindResult, tabs: AmExportDoc[]): Promise<ScreenPdfBuilder> {
  const pdf = await createScreenPdf("portrait");
  const stamp = screenExportStamp();
  const subtitle = `${result.productName} · ${result.productCode} · ${stamp}`;
  pdf.setDocumentProperties({
    title: `Unwinding Calculator · ${result.productCode}`,
    subject: `Unwind as of ${formatDeskDate(result.unwindDate)}`,
  });

  await pdf.addLogo();
  pdf.addBanner("Unwinding Calculator", subtitle);
  pdf.addProductHero(
    result.productName,
    `${result.productCode}   ·   ${formatNumber(result.debentures, 0)} Debentures   ·   Spot ${formatNumber(result.spot, 2)}   ·   ${formatDeskDate(result.unwindDate)}`,
  );

  pdf.addSection("Input Parameters");
  pdf.addKeyValueTable(inputRows(result));

  pdf.addSection("Unwind Quote and Internal Rates of Return");
  pdf.addKpiHighlightTable(quoteRows(result));

  pdf.addSection("Product Facts");
  pdf.addKeyValueTable(factRows(result));

  pdf.addSection("NBFC MIS");
  pdf.addKeyValueTable(fundingRows(result));

  pdf.addSection("NBFC Book Values");
  pdf.addKeyValueTable(rupeeRows(result));

  for (const doc of tabs) {
    pdf.newPage(doc.orientation);
    pdf.addBanner(doc.title, amSubtitle(doc, result));
    addAmPdfSections(pdf, doc);
  }
  pdf.addDisclaimer();
  return pdf;
}

export async function downloadUnwindScreenPdf(result: UnwindResult, tabs: AmExportDoc[] = []) {
  const pdf = await buildUnwindScreenPdf(result, tabs);
  pdf.save(
    buildDeskExportFilename({
      screen: "Unwinding-Calculator",
      productCode: result.productCode,
      productName: result.productName,
      extension: "pdf",
    }),
  );
}

export async function downloadOptionsBookPdf(result: UnwindResult) {
  const pdf = await createScreenPdf("landscape");
  const stamp = screenExportStamp();
  const subtitle = `${result.productName} · ${result.productCode} · ${stamp}`;
  pdf.setDocumentProperties({
    title: `Options Book · ${result.productCode}`,
    subject: `Unwind marks as of ${formatDeskDate(result.unwindDate)}`,
  });

  await pdf.addLogo();
  pdf.addBanner("Options Book", subtitle);
  pdf.addSection("Unwind Marks");
  pdf.addDataTable([...OPTION_HEADERS], optionRowsFlat(result), 6.2, 1, OPTION_BOOK_MERGE_COLS);
  pdf.addDisclaimer();

  pdf.save(
    buildDeskExportFilename({
      screen: "Options-Book",
      productCode: result.productCode,
      productName: result.productName,
      extension: "pdf",
    }),
  );
}

/* ── Active Management tabs: Active Management, Pricer Table, Scenario Grid ── */

function amSubtitle(doc: AmExportDoc, result: UnwindResult): string {
  return [result.productName, result.productCode, doc.subtitle, screenExportStamp()].filter(Boolean).join(" · ");
}

/** Native number or date; an explicit format wins over the header-driven one. */
function writeAmCell(cell: ExcelJS.Cell, value: ExcelCell, header: string, numFmt?: string) {
  writeExcelCell(cell, value, header);
  if (numFmt && typeof cell.value === "number") cell.numFmt = numFmt;
}

/** Unwinding Summary key values, then each value rewritten as a native number or date. */
function addAmValues(sheet: ExcelJS.Worksheet, startRow: number, rows: AmValue[], toCol: number): number {
  const next = addKeyValues(sheet, startRow, rows.map((row): [string, string] => [row.label, row.text]), toCol);
  rows.forEach((row, i) => {
    writeAmCell(sheet.getCell(startRow + i, 2), row.excel, row.label, row.numFmt);
    // Long plain-word lines (warnings) wrap inside the merged value cell.
    if (row.text.length > 90) sheet.getRow(startRow + i).height = 15 * Math.ceil(row.text.length / 90);
  });
  return next;
}

/** Desk data table (header, banding, clubbing), then native values and the shaded base row. */
function addAmTable(sheet: ExcelJS.Worksheet, startRow: number, table: AmTable): number {
  const groupCol = table.groupCol ?? 0;
  const mergeCols = [...(table.mergeCols ?? [])];
  const next = addDataTable(sheet, startRow, table.headers, table.text, groupCol, undefined, mergeCols);
  const spans = computeGroupedRowSpans(table.text, mergeCols, groupCol);
  table.excel.forEach((row, ri) => {
    row.forEach((value, ci) => {
      if (spans[ri]?.[ci] === 0) return;
      const cell = sheet.getCell(startRow + 1 + ri, ci + 1);
      writeAmCell(cell, value, table.headers[ci] ?? "", table.numFmts[ci]);
      if (ri === table.highlightRow) {
        cell.fill = excelFill(EXCEL_THEME.goldSoft);
        cell.font = { ...cell.font, bold: true, color: { argb: EXCEL_THEME.maroonDeep } };
      }
    });
  });
  return next;
}

/** An Active Management tab's sections: key values as label and value rows, tables as desk tables. */
function addAmPdfSections(pdf: ScreenPdfBuilder, doc: AmExportDoc) {
  for (const section of doc.sections) {
    pdf.addSection(section.title);
    if (section.values) {
      pdf.addKeyValueTable(section.values.map((value): [string, string] => [value.label, value.text]));
    }
    if (section.table) {
      const cols = section.table.headers.length;
      pdf.addDataTable(
        section.table.headers,
        section.table.text,
        cols > 12 ? 5.4 : 6.8,
        section.table.groupCol ?? 0,
        section.table.mergeCols ?? [],
      );
    }
  }
}

/** One Active Management tab as a sheet of `wb`: banner, its sections and the disclaimer. */
function addActiveManagementSheet(wb: ExcelJS.Workbook, doc: AmExportDoc, result: UnwindResult, logoOffset: number) {
  const cols = Math.max(6, ...doc.sections.map((section) => section.table?.headers.length ?? 0));
  const ws = wb.addWorksheet(doc.sheetName, { views: [{ showGridLines: false }] });
  let row = addBanner(ws, doc.title, amSubtitle(doc, result), cols, logoOffset);
  if (doc.inputs) {
    const excelInputs = exportInputRows(result);
    row = addExcelSection(ws, row, "Input Parameters", 1, cols);
    row = addAmValues(
      ws,
      row,
      inputRows(result).map(([label, text], i) => ({ label, text, excel: excelInputs[i]?.[1] ?? text })),
      cols,
    );
  }
  for (const section of doc.sections) {
    row = addExcelSection(ws, row, section.title, 1, cols);
    if (section.values) row = addAmValues(ws, row, section.values, cols);
    if (section.table) row = addAmTable(ws, row, section.table);
  }
  addDisclaimer(ws, row, cols);
  autofitExcelColumns(ws);
  return ws;
}

/** Excel for one Active Management tab: banner, its sections and the disclaimer on one sheet. */
export async function downloadActiveManagementExcel(doc: AmExportDoc, result: UnwindResult) {
  const logo = await fetchBrandLogoBase64();
  const wb = await createWorkbook();
  const sheet = addActiveManagementSheet(wb, doc, result, logo ? 3 : 0);
  if (logo) embedBrandLogo(wb, sheet, logo, Math.max(sheet.columnCount || 6, 6));
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: doc.screen,
      productCode: result.productCode,
      productName: result.productName,
      extension: "xlsx",
    }),
  );
}

/** PDF for one Active Management tab, in the Unwinding Calculator chrome. */
export async function downloadActiveManagementPdf(doc: AmExportDoc, result: UnwindResult) {
  const pdf = await createScreenPdf(doc.orientation);
  pdf.setDocumentProperties({
    title: `${doc.title} · ${result.productCode}`,
    subject: `${doc.title} as of ${formatDeskDate(result.unwindDate)}`,
  });

  await pdf.addLogo();
  pdf.addBanner(doc.title, amSubtitle(doc, result));
  pdf.addProductHero(
    result.productName,
    `${result.productCode}   ·   ${formatNumber(result.debentures, 0)} Debentures   ·   Spot ${formatNumber(result.spot, 2)}   ·   ${formatDeskDate(result.unwindDate)}`,
  );
  if (doc.inputs) {
    pdf.addSection("Input Parameters");
    pdf.addKeyValueTable(inputRows(result));
  }
  addAmPdfSections(pdf, doc);
  pdf.addDisclaimer();

  pdf.save(
    buildDeskExportFilename({
      screen: doc.screen,
      productCode: result.productCode,
      productName: result.productName,
      extension: "pdf",
    }),
  );
}
