import { deskTodayISO } from "@/lib/dates";

export type ExportCell = string | number | null;
export type ExportKind = "text" | "number" | "integer" | "pct" | "money" | "crore";
export type ExportColumn = { label: string; kind: ExportKind };
export type ExportTable = { title: string; subtitle: string; columns: ExportColumn[]; rows: ExportCell[][] };

const MAROON = "7A1E2C";
const GOLD = "D4B24C";
const IVORY = "FAF7EF";

const NUM_FMT: Record<ExportKind, string | undefined> = {
  text: undefined,
  number: "#,##0.00",
  integer: "#,##0",
  pct: "0.000%",
  money: "#,##0.00",
  crore: "#,##0.000",
};

function fileName(title: string, ext: string): string {
  return `${title.replace(/[^A-Za-z0-9]+/g, "-")}-${deskTodayISO()}.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Plain, elegant workbook: masthead, maroon header, number formats, no frozen panes. */
export async function downloadExcel(table: ExportTable): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Active Management Dashboard";
  const ws = wb.addWorksheet(table.title.slice(0, 31));
  ws.addRow([`Anand Rathi Wealth · ${table.title}`]).font = { name: "Calibri", size: 14, bold: true, color: { argb: `FF${MAROON}` } };
  ws.addRow([table.subtitle]).font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF57534E" } };
  ws.addRow([]);
  const header = ws.addRow(table.columns.map((c) => c.label));
  header.eachCell((cell) => {
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${MAROON}` } };
    cell.border = { bottom: { style: "medium", color: { argb: `FF${GOLD}` } } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  table.rows.forEach((values, i) => {
    const row = ws.addRow(values.map((v) => (v == null ? "-" : v)));
    row.eachCell((cell, colNumber) => {
      const col = table.columns[colNumber - 1];
      cell.font = { name: "Calibri", size: 10 };
      if (col && typeof cell.value === "number" && NUM_FMT[col.kind]) cell.numFmt = NUM_FMT[col.kind]!;
      if (col && col.kind !== "text") cell.alignment = { horizontal: "right" };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${IVORY}` } };
    });
  });
  ws.columns.forEach((column, i) => {
    const longest = Math.max(table.columns[i]?.label.length ?? 8, ...table.rows.slice(0, 500).map((r) => String(r[i] ?? "-").length));
    column.width = Math.min(48, Math.max(10, longest + 2));
  });
  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(table.title, "xlsx"));
}

function pdfCell(v: ExportCell, kind: ExportKind): string {
  if (v == null || v === "") return "-";
  if (typeof v !== "number") return String(v);
  if (kind === "pct") return `${(v * 100).toFixed(3)}%`;
  if (kind === "integer") return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (kind === "crore") return v.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function downloadPdf(table: ExportTable): Promise<void> {
  const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable").then((m) => m.default)]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(122, 30, 44);
  doc.text(`Anand Rathi Wealth · ${table.title}`, 36, 40);
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.setTextColor(87, 83, 78);
  doc.text(table.subtitle, 36, 58);
  doc.setDrawColor(212, 178, 76);
  doc.setLineWidth(1.2);
  doc.line(36, 66, doc.internal.pageSize.getWidth() - 36, 66);
  autoTable(doc, {
    startY: 76,
    head: [table.columns.map((c) => c.label)],
    body: table.rows.map((r) => r.map((v, i) => pdfCell(v, table.columns[i]?.kind ?? "text"))),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [122, 30, 44], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 239] },
    columnStyles: Object.fromEntries(table.columns.map((c, i) => [i, { halign: c.kind === "text" ? "left" : "right" }])),
    margin: { left: 36, right: 36 },
  });
  doc.save(fileName(table.title, "pdf"));
}
