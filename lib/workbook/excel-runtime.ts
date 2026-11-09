import type { Workbook } from "exceljs";

import { preloadPdfExport } from "@/lib/workbook/pdf-runtime";

type ExcelJsModule = typeof import("exceljs");

let excelModule: Promise<ExcelJsModule> | null = null;

/** Lazy-load ExcelJS only when an export is requested. */
export function loadExcelJS(): Promise<ExcelJsModule> {
  if (!excelModule) {
    excelModule = import("exceljs");
  }
  return excelModule;
}

function workbookCtor(mod: ExcelJsModule): new () => Workbook {
  const candidate = (mod as ExcelJsModule & { default?: ExcelJsModule }).default ?? mod;
  if (typeof (candidate as { Workbook?: unknown }).Workbook === "function") {
    return (candidate as { Workbook: new () => Workbook }).Workbook;
  }
  // Some CJS interop shapes expose Workbook on the module root only.
  return (mod as { Workbook: new () => Workbook }).Workbook;
}

export async function createWorkbook(): Promise<Workbook> {
  const mod = await loadExcelJS();
  const Workbook = workbookCtor(mod);
  const wb = new Workbook();
  wb.creator = "Active Management Dashboard · Anand Rathi Wealth";
  wb.lastModifiedBy = "Active Management Dashboard";
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/** Warm screen export chunks while the user reads on-screen output. */
export function preloadExcelExport(): void {
  void loadExcelJS();
  void import("@/lib/workbook/export-screen");
  preloadPdfExport();
}
