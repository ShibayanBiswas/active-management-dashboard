let pdfModule: Promise<typeof import("jspdf")> | null = null;
let autoTableModule: Promise<typeof import("jspdf-autotable")> | null = null;

export async function loadJsPdf() {
  if (!pdfModule) pdfModule = import("jspdf");
  return pdfModule;
}

export async function loadAutoTable() {
  if (!autoTableModule) autoTableModule = import("jspdf-autotable");
  return autoTableModule;
}

/** Warm PDF export chunks while the user reads on-screen output. */
export function preloadPdfExport(): void {
  void loadJsPdf();
  void loadAutoTable();
  void import("@/lib/workbook/export-screen");
}
