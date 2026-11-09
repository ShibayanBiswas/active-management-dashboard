import * as XLSX from "xlsx";

import { DEFAULT_SURFACE_MONTH_KEY } from "@/lib/engine/vol-surface";
import { deskTodayISO } from "@/lib/utils";
import { isinKey } from "@/lib/multi/product-key";
import { asMoneyness, HEADER_ALIASES, parseVolSurfaceWorkbook } from "@/lib/workbook/parsers";

export type DeskUploadKind = "vol-surface" | "product-master";
type DeskBookKind = "single" | "multi";

export type VolSurfaceUploadSummary = {
  expiries: number;
  strikePercents: number[];
  hasDeep: boolean;
  hasExpiryDate: boolean;
  hasStrikeChange: boolean;
};

export type ProductMasterUploadSummary = {
  productName: string;
  productCode: string;
  legs: number;
  columnsFound: number;
  productCount: number;
};

export type UploadValidation =
  | { ok: true; kind: "vol-surface"; summary: VolSurfaceUploadSummary }
  | { ok: true; kind: "product-master"; summary: ProductMasterUploadSummary }
  | { ok: false; kind: DeskUploadKind; issues: string[] };

type Grid = (string | number | Date | null)[][];

function cellIsDate(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === "number") return v > 20000 && v < 80000;
  if (typeof v === "string") return /\d{4}-\d{2}-\d{2}/.test(v) || /\d{1,2}[-/ ][A-Za-z]{3}/.test(v);
  return false;
}

function cellText(v: unknown): string {
  return String(v ?? "").trim();
}

export const MAX_UPLOAD_BYTES = 96 * 1024 * 1024;

function readWorkbookGrids(buffer: ArrayBuffer): Grid[] {
  try {
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    return wb.SheetNames.map((name) =>
      XLSX.utils.sheet_to_json<Grid[number]>(wb.Sheets[name], {
        header: 1,
        defval: null,
        raw: true,
      }),
    );
  } catch {
    return [];
  }
}

function looksLikeProductMaster(grid: Grid): boolean {
  return grid.slice(0, 20).some((row) => {
    const first = cellText(row?.[0]).toLowerCase();
    return first === "product name" || first === "product";
  });
}

function looksLikeVolSurface(grid: Grid): boolean {
  return grid.slice(0, 25).some((row) =>
    (row ?? []).some((cell) => {
      const t = cellText(cell).toLowerCase();
      return t.includes("strike change") || t === "deep" || t.includes("expiry date");
    }),
  );
}

export function productMasterFileDeskHint(fileName: string): DeskBookKind | null {
  const name = fileName.trim().toLowerCase().replace(/\s+/g, "_");
  if (/multiple|multi[_-]?product/.test(name)) return "multi";
  if (/nifty_accelerator_961|_961\.|single[_-]?product/.test(name)) return "single";
  return null;
}

export function productMasterDeskMismatch(fileName: string, book: DeskBookKind): string | null {
  const hinted = productMasterFileDeskHint(fileName);
  if (!hinted || hinted === book) return null;
  if (book === "single") {
    return "This file is the Multiple Products sample. Switch to Multiple Product Version, then upload it there.";
  }
  return "This file is the Single Product sample. Upload the Multiple Products master on this desk.";
}

export function validateUploadFileName(fileName: string): string | null {
  const lower = fileName.trim().toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    return "Upload an Excel workbook (.xlsx or .xlsm). This file is not the desk template.";
  }
  return null;
}

function validateUploadSize(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return "This workbook is larger than 96 MB. Upload a Product Master or Volatility Surface workbook, not an unrelated archive.";
  }
  return null;
}

/** Asia/Kolkata calendar month. Uploads and the carried surface use this, not the server clock. */
export function currentUploadMonthKey(): string {
  return deskTodayISO().slice(0, 7);
}

/** Public sample filename for the seeded Volatility Surface (desk default month). */
export function volSurfaceSampleFileName(monthKey = DEFAULT_SURFACE_MONTH_KEY): string {
  const [year, month] = monthKey.split("-").map(Number);
  const name = new Date(Date.UTC(year || 2026, (month || 1) - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });
  return `Vol_Surface_Input_${name}.xlsx`;
}

/** Display label for the seeded Volatility Surface sample download. */
export function volSurfaceSampleLabel(monthKey = DEFAULT_SURFACE_MONTH_KEY): string {
  const [year, month] = monthKey.split("-").map(Number);
  const name = new Date(Date.UTC(year || 2026, (month || 1) - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });
  return `Volatility Surface Input · ${name} ${year || new Date().getFullYear()}`;
}

export function validateVolSurfaceWorkbook(buffer: ArrayBuffer): UploadValidation {
  if (!buffer.byteLength) {
    return { ok: false, kind: "vol-surface", issues: ["The workbook is empty."] };
  }
  const sizeIssue = validateUploadSize(buffer);
  if (sizeIssue) return { ok: false, kind: "vol-surface", issues: [sizeIssue] };

  const grids = readWorkbookGrids(buffer);
  if (!grids.length) {
    return {
      ok: false,
      kind: "vol-surface",
      issues: ["This file is not a readable Excel workbook matching the Volatility Surface sample."],
    };
  }
  const grid = grids.find((g) => looksLikeVolSurface(g)) ?? grids[0];

  const issues: string[] = [];
  if (looksLikeProductMaster(grid) && !looksLikeVolSurface(grid)) {
    issues.push("This looks like a Product Master file. Use Upload Product Master for this workbook.");
    return { ok: false, kind: "vol-surface", issues };
  }

  try {
    const parsed = parseVolSurfaceWorkbook(buffer);
    if (parsed.expiries.length >= 1 && parsed.moneyness.length >= 1) {
      return {
        ok: true,
        kind: "vol-surface",
        summary: {
          expiries: parsed.expiries.length,
          strikePercents: parsed.moneyness,
          hasDeep: true,
          hasExpiryDate: true,
          hasStrikeChange: true,
        },
      };
    }
  } catch {
    // Fall through to the sample-layout messages below.
  }

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const row = grid[i] ?? [];
    if (
      row.some((cell) => {
        const t = cellText(cell).toLowerCase();
        return t.includes("strike change") || t === "strike";
      })
    ) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    issues.push("Strike Change header is missing. Keep the sample layout: Strike Change, Deep, then percent columns.");
  }

  const header = grid[headerRow] ?? [];
  const hasDeep = header.some((cell) => cellText(cell).toLowerCase() === "deep");
  if (headerRow >= 0 && !hasDeep) {
    issues.push("The Deep column is missing. Keep Deep as the first strike-change column. Deep Strike stays ₹500.");
  }

  const strikePercents: number[] = [];
  if (headerRow >= 0) {
    for (const cell of header) {
      const mv = asMoneyness(cell);
      if (mv != null) strikePercents.push(Math.round(mv * 10000) / 10000);
    }
  }
  if (headerRow >= 0 && !strikePercents.length) {
    issues.push("Strike percent columns are missing. You may add or remove percent columns, but at least one percent column is required.");
  }

  let expiryHeaderRow = -1;
  const scanFrom = headerRow >= 0 ? headerRow : 0;
  for (let i = scanFrom; i < Math.min(grid.length, scanFrom + 8); i++) {
    if ((grid[i] ?? []).some((cell) => cellText(cell).toLowerCase().includes("expiry"))) {
      expiryHeaderRow = i;
      break;
    }
  }
  if (expiryHeaderRow < 0) {
    issues.push("Expiry Date row is missing. Keep that label under Strike Change. You may add or remove expiry rows below it.");
  }

  const dataStart = expiryHeaderRow >= 0 ? expiryHeaderRow + 1 : headerRow + 2;
  let expiries = 0;
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const a = cellText(row[0]).toLowerCase();
    const b = cellText(row[1]).toLowerCase();
    if (a === "date" && (b === "days" || b.includes("rate"))) break;
    if (row.some((cell) => cellIsDate(cell))) expiries += 1;
    else if (expiries) break;
  }
  if (expiries < 1) {
    issues.push("No expiry rows were found. Keep dates down the first column. The number of expiries may change.");
  }

  const params =
    grids.find((g) =>
      g.some((row) => {
        const a = cellText(row?.[0]).toLowerCase();
        return (
          a === "vol bump" ||
          a === "volatility bump" ||
          a === "forward sell rate" ||
          (a.includes("reference") && (a.includes("underlying") || a.includes("nifty") || a.includes("sensex")))
        );
      }),
    ) ?? grids[1];
  if (!params) {
    issues.push("Sheet two is missing. Keep Volatility Bump and Forward Sell Rate on the parameters sheet.");
  } else {
    let bump = false;
    let fwd = false;
    let ref = false;
    let sensexRef = false;
    let legacy = false;
    for (const row of params) {
      const a = cellText(row?.[0]).toLowerCase();
      const b = cellText(row?.[1]).toLowerCase();
      if (a === "vol bump" || a === "volatility bump") bump = true;
      if (a === "forward sell rate") fwd = true;
      if (a.includes("reference") && (a.includes("underlying") || a.includes("nifty"))) ref = true;
      if (a.includes("reference") && a.includes("sensex")) sensexRef = true;
      if (a === "date" && b.includes("vol")) legacy = true;
    }
    if (!((bump && fwd) || legacy)) {
      issues.push("Sheet two must list Volatility Bump and Forward Sell Rate, matching the sample parameters sheet.");
    }
    if (!ref && !legacy) {
      issues.push("Sheet two must list Reference Nifty Price (100% strike anchor), matching the sample parameters sheet.");
    }
    if (!sensexRef && !legacy) {
      issues.push("Sheet two must list Reference Sensex Price (100% strike anchor), matching the sample parameters sheet.");
    }
  }

  if (issues.length) return { ok: false, kind: "vol-surface", issues };
  return {
    ok: true,
    kind: "vol-surface",
    summary: {
      expiries,
      strikePercents,
      hasDeep: true,
      hasExpiryDate: true,
      hasStrikeChange: true,
    },
  };
}

export function validateProductMasterWorkbook(buffer: ArrayBuffer): UploadValidation {
  if (!buffer.byteLength) {
    return { ok: false, kind: "product-master", issues: ["The workbook is empty."] };
  }
  const sizeIssue = validateUploadSize(buffer);
  if (sizeIssue) return { ok: false, kind: "product-master", issues: [sizeIssue] };

  const grids = readWorkbookGrids(buffer);
  if (!grids.length) {
    return {
      ok: false,
      kind: "product-master",
      issues: ["This file is not a readable Excel workbook matching the Product Master sample."],
    };
  }
  const grid = grids.find((g) => looksLikeProductMaster(g)) ?? grids[0];

  const issues: string[] = [];
  if (looksLikeVolSurface(grid) && !looksLikeProductMaster(grid)) {
    issues.push("This looks like a Volatility Surface file. Use Upload Volatility Surface for this workbook.");
    return { ok: false, kind: "product-master", issues };
  }

  let headRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const first = cellText(grid[i]?.[0]).toLowerCase();
    if (first === "product name" || first === "product") {
      headRow = i;
      break;
    }
  }
  if (headRow < 0) {
    issues.push("Product Name header row is missing. Keep the same 28-column Product Master layout as the sample.");
    return { ok: false, kind: "product-master", issues };
  }

  const headers = (grid[headRow] ?? []).map((h) => cellText(h));
  const missing: string[] = [];
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = aliases.some((alias) =>
      headers.some((h) => h.toLowerCase() === alias.toLowerCase()),
    );
    if (!found) missing.push(aliases[0] ?? field);
  }
  if (missing.length) {
    issues.push(`These sample columns are missing: ${missing.join(", ")}. Column labels must stay the same as the Product Master sample.`);
  }

  const expiryIdx = headers.findIndex((h) =>
    HEADER_ALIASES.expiry.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );
  const strikeIdx = headers.findIndex((h) =>
    HEADER_ALIASES.strike.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );
  const typeIdx = headers.findIndex((h) =>
    HEADER_ALIASES.optionType.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );
  const qtyIdx = headers.findIndex((h) =>
    HEADER_ALIASES.reqQuantity.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );

  const dataRows: Grid = [];
  for (let r = headRow + 1; r < grid.length; r++) {
    const row = [...(grid[r] ?? [])];
    const first = cellText(row[0]);
    if (first.length > 60 && row.slice(1).every((c) => c == null || c === "")) break;
    const hasLeg =
      (expiryIdx >= 0 && row[expiryIdx] != null) || (strikeIdx >= 0 && row[strikeIdx] != null);
    if (!hasLeg && dataRows.length > 0 && row.every((c) => c == null || c === "")) break;
    dataRows.push(row);
  }
  const width = Math.max(headers.length, ...dataRows.map((row) => row.length), 0);
  for (let c = 0; c < width; c++) {
    // Do not forward-fill Required Quantity — blank / zero slots are unused expiry rows.
    if (qtyIdx >= 0 && c === qtyIdx) continue;
    let last: string | number | Date | null = null;
    for (const row of dataRows) {
      if (row[c] != null && row[c] !== "") last = row[c];
      else if (last != null) row[c] = last;
    }
  }
  let legs = 0;
  for (const row of dataRows) {
    if (
      typeIdx >= 0 &&
      row[typeIdx] != null &&
      strikeIdx >= 0 &&
      row[strikeIdx] != null &&
      expiryIdx >= 0 &&
      row[expiryIdx] != null
    ) {
      const qty = qtyIdx >= 0 ? row[qtyIdx] : null;
      if (qty == null || qty === "") continue;
      const n = Number(qty);
      if (!Number.isFinite(n) || n === 0) continue;
      legs += 1;
    }
  }
  if (legs < 1) {
    issues.push(
      "No option legs were found. Keep Option Type, Strike Price, Option Expiry Date and a non-zero Required Quantity on every leg row.",
    );
  }

  if (issues.length) return { ok: false, kind: "product-master", issues };

  const nameIdx = headers.findIndex((h) =>
    HEADER_ALIASES.productName.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );
  const codeIdx = headers.findIndex((h) =>
    HEADER_ALIASES.productCode.some((alias) => h.toLowerCase() === alias.toLowerCase()),
  );
  const productKeys = new Set<string>();
  for (const row of dataRows) {
    const name = cellText(nameIdx >= 0 ? row[nameIdx] : "");
    const code = cellText(codeIdx >= 0 ? row[codeIdx] : "");
    if (!name && !code) continue;
    // Count unique Product Codes (ISIN); name only when code is blank.
    productKeys.add(isinKey({ productName: name, productCode: code }));
  }
  const first = dataRows[0] ?? [];
  return {
    ok: true,
    kind: "product-master",
    summary: {
      productName: cellText(nameIdx >= 0 ? first[nameIdx] : ""),
      productCode: cellText(codeIdx >= 0 ? first[codeIdx] : ""),
      legs,
      columnsFound: headers.filter(Boolean).length,
      productCount: Math.max(productKeys.size, 1),
    },
  };
}

export function validateDeskUpload(
  kind: DeskUploadKind,
  fileName: string,
  buffer: ArrayBuffer,
  book: DeskBookKind = "single",
): UploadValidation {
  const nameIssue = validateUploadFileName(fileName);
  if (nameIssue) return { ok: false, kind, issues: [nameIssue] };
  const sizeIssue = validateUploadSize(buffer);
  if (sizeIssue) return { ok: false, kind, issues: [sizeIssue] };
  if (kind === "product-master") {
    const fileDeskIssue = productMasterDeskMismatch(fileName, book);
    if (fileDeskIssue) return { ok: false, kind, issues: [fileDeskIssue] };
  }
  switch (kind) {
    case "vol-surface":
      return validateVolSurfaceWorkbook(buffer);
    case "product-master": {
      const parsed = validateProductMasterWorkbook(buffer);
      if (!parsed.ok || parsed.kind !== "product-master") return parsed;
      if (book === "single" && parsed.summary.productCount > 1) {
        return {
          ok: false,
          kind,
          issues: [
            `This workbook has ${parsed.summary.productCount} products. Switch to Multiple Product Version and upload it there. Single Product Version accepts one product.`,
          ],
        };
      }
      return parsed;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled upload kind: ${_exhaustive}`);
    }
  }
}
