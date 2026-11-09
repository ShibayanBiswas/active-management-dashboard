import * as XLSX from "xlsx";

import { bookPremiumFraction } from "@/lib/engine/product-premium";
import { DEEP_STRIKE, DEFAULT_FWD_SELL_RATE } from "@/lib/engine/vol-surface";
import { dedupeOptionLegs } from "@/lib/multi/leg-position";
import type { OptionLeg, PricingParamPoint, ProductMaster, VolSurface } from "@/lib/types";
import { daysBetween, deskTodayISO, parseISODate } from "@/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcMidnightIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T00:00:00.000Z`;
}

/** Calendar date only — round SheetJS 18:29:50 artifacts to the Excel day in the blue block. */
function excelDateToIso(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const rounded = new Date(Math.round(v.getTime() / 86_400_000) * 86_400_000);
    return utcMidnightIso(rounded);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const serial = Math.round(v);
    return utcMidnightIso(new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000));
  }
  if (typeof v === "string") {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) {
      const rounded = new Date(Math.round(parsed.getTime() / 86_400_000) * 86_400_000);
      return utcMidnightIso(rounded);
    }
  }
  // Unparseable date: the desk (India) calendar day, never the UTC day.
  return `${deskTodayISO()}T00:00:00.000Z`;
}

function asFraction(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n > 1 ? n / 100 : n;
}

/** 1.18 stays 118%. 118 becomes 1.18. Rates such as 0.075 stay fractions. */
function asCoupon(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n > 5) return n / 100;
  return n;
}

/**
 * Normalize Required Quantity + Buy/Sell.
 * Blank Buy/Sell: trust already-signed Main Master quantities (negative = Sell).
 */
function normalizeSideAndQty(sideRaw: string, qty: number): { side: string; qty: number } {
  if (!Number.isFinite(qty)) return { side: "Buy", qty: 0 };
  const s = sideRaw.trim().toLowerCase();
  if (s.startsWith("s")) {
    return { side: "Sell", qty: qty > 0 ? -qty : qty };
  }
  if (s.startsWith("b")) {
    return { side: "Buy", qty: qty < 0 ? -qty : qty };
  }
  if (qty < 0) return { side: "Sell", qty };
  return { side: "Buy", qty };
}

function optionalCol(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h.toLowerCase() === alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Strike-change percents: 0.55 / 55 / 150 all mean the same column. */
export function asMoneyness(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 0.2 && n <= 2) return n;
  if (n >= 20 && n <= 200) return n / 100;
  return null;
}

function cellIsDate(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === "number") return v > 20000 && v < 80000;
  if (typeof v === "string") return /\d{4}-\d{2}-\d{2}/.test(v) || /\d{1,2}[-/ ][A-Za-z]{3}/.test(v);
  return false;
}

function rowLooksLikeRates(row: (string | number | Date | null)[]): boolean {
  const a = String(row[0] ?? "").trim().toLowerCase();
  const b = String(row[1] ?? "").trim().toLowerCase();
  return a === "date" && (b === "days" || b.includes("rate"));
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function currentMonthKey(): string {
  return deskTodayISO().slice(0, 7);
}

function surfaceLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const name = MONTH_LABELS[(m || 1) - 1] ?? "";
  return `${name} ${y} Volatility Surface`.trim();
}

function headerCell(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function findCol(row: (string | number | Date | null)[], ...needles: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const h = headerCell(row[i]);
    if (needles.some((n) => h === n || h.includes(n))) return i;
  }
  return -1;
}

function parseReferenceUnderlyingPrice(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n > 0 && n < 10) return undefined;
  return n;
}

function parsePricingParamsGrid(grid2: (string | number | Date | null)[][]): {
  pricingParams: PricingParamPoint[];
  volBump: number;
  fwdSellRate: number;
  referenceUnderlyingPrice?: number;
  referenceSensexPrice?: number;
} {
  let volBump = 0;
  let fwdSellRate = DEFAULT_FWD_SELL_RATE;
  let referenceUnderlyingPrice: number | undefined;
  let referenceSensexPrice: number | undefined;
  const pricingParams: PricingParamPoint[] = [];

  let kvDateRow = -1;
  let nativeHeaderRow = -1;
  let nativeDateCol = -1;
  let nativeBumpCol = -1;
  let nativeFwdCol = -1;

  for (let i = 0; i < grid2.length; i++) {
    const row = grid2[i] ?? [];
    const a = headerCell(row[0]);
    const b = row[1];
    if (a === "date" && headerCell(b).includes("vol")) {
      kvDateRow = i;
      break;
    }
    if (a === "vol bump" || a === "volatility bump") volBump = asFraction(b, 0);
    if (a === "forward sell rate") fwdSellRate = asFraction(b, DEFAULT_FWD_SELL_RATE);
    if (a.includes("reference") && a.includes("sensex")) {
      referenceSensexPrice = parseReferenceUnderlyingPrice(b);
    } else if (
      a.includes("reference") &&
      (a.includes("nifty") || a.includes("underlying"))
    ) {
      referenceUnderlyingPrice = parseReferenceUnderlyingPrice(b);
    }

    // Native XLSM Pricing Params: date in col B, BID in C, Fwd Sell rate in H.
    // Column A key/value rows ("Forward Sell Rate") must not count as that header.
    const fwdCol = findCol(row, "fwd sell");
    const bidCol = findCol(row, "bid");
    if (fwdCol > 0 && nativeHeaderRow < 0) {
      nativeHeaderRow = i;
      nativeFwdCol = fwdCol;
      nativeBumpCol = bidCol >= 0 && bidCol !== fwdCol ? bidCol : findCol(row, "vol bump", "vol - bid");
      const next = grid2[i + 1] ?? [];
      nativeDateCol = next.findIndex((cell, idx) => idx <= 3 && cellIsDate(cell));
      if (nativeDateCol < 0) nativeDateCol = 1;
    }
  }

  if (kvDateRow >= 0) {
    for (let r = kvDateRow + 1; r < grid2.length; r++) {
      const row = grid2[r] ?? [];
      if (row[0] == null) continue;
      pricingParams.push({
        date: excelDateToIso(row[0]),
        volBump: asFraction(row[1], 0),
        fwdSellRate: asFraction(row[2], DEFAULT_FWD_SELL_RATE),
      });
    }
  } else if (nativeHeaderRow >= 0 && nativeFwdCol >= 0 && nativeDateCol >= 0) {
    for (let r = nativeHeaderRow + 1; r < grid2.length; r++) {
      const row = grid2[r] ?? [];
      const dateCell = row[nativeDateCol];
      if (!cellIsDate(dateCell)) {
        if (pricingParams.length) break;
        continue;
      }
      pricingParams.push({
        date: excelDateToIso(dateCell),
        volBump: nativeBumpCol >= 0 ? asFraction(row[nativeBumpCol], 0) : 0,
        fwdSellRate: asFraction(row[nativeFwdCol], DEFAULT_FWD_SELL_RATE),
      });
    }
  }

  return { pricingParams, volBump, fwdSellRate, referenceUnderlyingPrice, referenceSensexPrice };
}

function sheetToGrid(wb: XLSX.WorkBook, name: string): (string | number | Date | null)[][] {
  return XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(wb.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
  });
}

function volSheetRank(name: string): number {
  const n = name.toLowerCase();
  if (/market\s*data/.test(n)) return 3;
  if (/vol|surface/.test(n)) return 2;
  if (/param|calculator|master|pricer/.test(n)) return 0;
  return 1;
}

function gridLooksLikeVolSurface(grid: (string | number | Date | null)[][]): boolean {
  return grid.slice(0, 25).some((row) => {
    const labels = (row ?? []).slice(0, 4).map((v) => String(v ?? "").toLowerCase());
    if (labels.some((v) => v.includes("strike change") || v === "strike")) return true;
    return (row ?? []).filter((cell) => asMoneyness(cell) != null).length >= 3;
  });
}

export function parseVolSurfaceWorkbook(
  buffer: ArrayBuffer,
  monthKey: string = currentMonthKey(),
): VolSurface {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ranked = [...wb.SheetNames].sort((a, b) => volSheetRank(b) - volSheetRank(a));
  const surfaceName =
    ranked.find((name) => gridLooksLikeVolSurface(sheetToGrid(wb, name))) ?? ranked[0];
  const grid = sheetToGrid(wb, surfaceName);

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = grid[i] ?? [];
    const labels = row.slice(0, 4).map((v) => String(v ?? "").toLowerCase());
    if (labels.some((v) => v.includes("strike change") || v === "strike")) {
      headerRow = i;
      break;
    }
    const hits = row.filter((cell) => asMoneyness(cell) != null).length;
    if (hits >= 3) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error("Vol surface header row not found");

  const moneynessRow = grid[headerRow] ?? [];
  const moneyness: number[] = [];
  let firstMoneynessCol = -1;
  for (let c = 0; c < moneynessRow.length; c++) {
    const raw = String(moneynessRow[c] ?? "").trim().toLowerCase();
    if (raw === "deep" || raw.includes("strike change") || raw === "strike") continue;
    const mv = asMoneyness(moneynessRow[c]);
    if (mv == null) {
      if (firstMoneynessCol >= 0 && moneyness.length) break;
      continue;
    }
    if (firstMoneynessCol < 0) firstMoneynessCol = c;
    moneyness.push(Math.round(mv * 10000) / 10000);
  }
  if (!moneyness.length || firstMoneynessCol < 1) throw new Error("Strike Change percents not found");
  const deepVolCol = firstMoneynessCol - 1;
  const strikes = [DEEP_STRIKE, ...moneyness.map((m) => m)];

  let dataRow = headerRow + 1;
  while (dataRow < grid.length) {
    const probe = grid[dataRow] ?? [];
    const labels = probe.slice(0, 4).map((v) => String(v ?? "").toLowerCase());
    if (
      labels.some(
        (label) =>
          label.includes("strike price") ||
          label.includes("nifty strike") ||
          label.includes("sensex strike") ||
          label.includes("expiry"),
      )
    ) {
      dataRow += 1;
      continue;
    }
    const hasEarlyDate = cellIsDate(probe[1]) || cellIsDate(probe[2]) || cellIsDate(probe[0]);
    const numericHits = probe
      .slice(deepVolCol, deepVolCol + 1 + moneyness.length)
      .filter((c) => typeof c === "number" && Number.isFinite(Number(c))).length;
    if (!hasEarlyDate && numericHits >= 3) {
      dataRow += 1;
      continue;
    }
    break;
  }

  const expiries: string[] = [];
  const volsPercent: number[][] = [];
  const volWidth = 1 + moneyness.length;
  // MarketData blue block stores expiry dates in column B/C (index 1 or 2).
  let dateCol = -1;
  for (let r = dataRow; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (rowLooksLikeRates(row)) break;
    if (dateCol < 0) {
      if (cellIsDate(row[1])) dateCol = 1;
      else if (cellIsDate(row[2])) dateCol = 2;
      else {
        const found = row.findIndex((cell, idx) => idx <= 3 && cellIsDate(cell));
        if (found < 0) {
          if (expiries.length) break;
          continue;
        }
        dateCol = found;
      }
    }
    const dateCell = row[dateCol];
    if (!cellIsDate(dateCell)) {
      if (expiries.length) break;
      continue;
    }
    expiries.push(excelDateToIso(dateCell));
    const vols: number[] = [];
    for (let c = deepVolCol; c < deepVolCol + volWidth; c++) {
      vols.push(Number(row[c] ?? 0));
    }
    volsPercent.push(vols);
  }
  if (!expiries.length) throw new Error("No expiry rows found in vol surface");

  // Sheet 2 — August key/value, legacy Date/Vol Bump/Fwd, or native XLSM Pricing Params.
  let volBump = 0;
  let fwdSellRate = DEFAULT_FWD_SELL_RATE;
  let referenceUnderlyingPrice: number | undefined;
  let referenceSensexPrice: number | undefined;
  let pricingParams: PricingParamPoint[] = [];

  const paramName =
    wb.SheetNames.find((n) => /param/i.test(n)) ??
    wb.SheetNames.find((n) => n !== surfaceName) ??
    wb.SheetNames[1];
  if (paramName) {
    const parsed = parsePricingParamsGrid(sheetToGrid(wb, paramName));
    pricingParams = parsed.pricingParams;
    volBump = parsed.volBump;
    fwdSellRate = parsed.fwdSellRate;
    referenceUnderlyingPrice = parsed.referenceUnderlyingPrice;
    referenceSensexPrice = parsed.referenceSensexPrice;
  }

  if (!pricingParams.length) {
    // Single month point — flat vol bump + forward sell rate for the month
    const [y, m] = monthKey.split("-").map(Number);
    const endOfMonth = new Date(Date.UTC(y || new Date().getFullYear(), (m || 7), 0));
    pricingParams.push({
      date: endOfMonth.toISOString(),
      volBump,
      fwdSellRate,
    });
  }

  return {
    monthKey,
    label: surfaceLabel(monthKey),
    deepStrike: DEEP_STRIKE,
    moneyness,
    strikes,
    expiries,
    volsPercent,
    pricingParams,
    referenceUnderlyingPrice,
    referenceSensexPrice,
  };
}

export const HEADER_ALIASES: Record<string, string[]> = {
  productName: ["Product Name", "Product"],
  tradeDate: ["Trade Date", "Month"],
  productCode: ["Product Code"],
  mobilization: ["Mobilization Amount", "Mobilization"],
  unwinds: ["Unwinds", "Number of Unwinds"],
  initialNiftyLevel: ["Initial Underlying Level", "Initial Nifty Level"],
  contingentLevel: ["Contingent Level"],
  allotmentDate: ["Allotment Date"],
  tenorDays: ["Tenor Days", "Tenor in Days", "Tenor"],
  maturityDate: ["Maturity Date"],
  prdDiscRate: ["Product Discount Rate", "Prd Disc Rate"],
  premDiscRate: ["Premium Discount Rate", "Prem Disc Rate"],
  formulae: ["Payoff Formula", "Formulae"],
  coupon: ["Contingent Coupon Rate", "Contingent Coupon", "Coupon"],
  optionType: ["Option Type", "Req. Options", "Options"],
  strike: ["Strike Price", "Req. Strike", "Strike"],
  spreads: ["Number of Spreads", "Spreads", "Req. Spreads"],
  originalSide: ["Original Buy or Sell", "Original Buy Sell", "Buy / Sell", "Buy/Sell"],
  expiry: ["Option Expiry Date", "Option Expiry", "Req. Expiry", "Expiry"],
  reqQuantity: ["Required Quantity", "Req. Quantity", "Quantity"],
  prdPrice: ["Initial Product Price", "Product Price", "Prd Price"],
  inbuilt: ["Inbuilt Cost Rate", "Reported Inbuilt", "Inbuilt"],
  tranCost: ["Transaction Cost Rate", "Transaction Cost", "Tran Cost (%)", "Tran Cost"],
  issuanceCost: ["Issuance Cost Rate", "Issuance Cost"],
  marginCost: ["Margin Cost"],
  faceValue: ["Face Value"],
  totalFundsForMargin: ["Total Funds For Margin", "Total Funds Held for Margin", "Funds Reserved for Margin"],
  marginFundingRate: ["Margin Funding Rate"],
};

function gridLooksLikeProductMaster(grid: (string | number | Date | null)[][]): boolean {
  return grid.slice(0, 20).some((row) => {
    const first = String(row[0] ?? "").trim().toLowerCase();
    return first === "product name" || first === "product";
  });
}

/**
 * `issues`: when given, a missing valuation fact (dates, Initial Underlying Level, Face Value,
 * costs, discount rates) is reported there instead of parsed as 0. Desk uploads reject on any issue.
 */
/** Product facts that drive valuation; a desk upload must not leave them blank. */
const SINGLE_REQUIRED_FACTS: Array<[keyof typeof HEADER_ALIASES, string]> = [
  ["allotmentDate", "Allotment Date"],
  ["maturityDate", "Maturity Date"],
  ["initialNiftyLevel", "Initial Underlying Level"],
  ["faceValue", "Face Value"],
  ["inbuilt", "Reported Inbuilt"],
  ["tranCost", "Transaction Cost"],
  ["issuanceCost", "Issuance Cost"],
  ["prdDiscRate", "Product Discount Rate"],
  ["premDiscRate", "Premium Discount Rate"],
];

export function parseProductMasterWorkbook(buffer: ArrayBuffer, issues?: string[]): ProductMaster {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ranked = [...wb.SheetNames].sort((a, b) => (/master/i.test(b) ? 1 : 0) - (/master/i.test(a) ? 1 : 0));
  const masterName =
    ranked.find((name) => gridLooksLikeProductMaster(sheetToGrid(wb, name))) ?? ranked[0];
  const grid = sheetToGrid(wb, masterName);

  // Find header row: contains "Product Name" or "Product"
  let headRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const row = grid[i] ?? [];
    const first = String(row[0] ?? "").trim().toLowerCase();
    if (first === "product name" || first === "product") {
      headRow = i;
      break;
    }
  }
  if (headRow < 0) throw new Error("Product master header row not found");

  const headers = (grid[headRow] ?? []).map((h) => String(h ?? "").trim());
  const contingentIdx = optionalCol(headers, ["Contingent Level"]);
  const marginCostIdx = optionalCol(headers, ["Margin Cost"]);
  const sdCodeIdx = optionalCol(headers, ["SD Codes", "Option Code"]);
  const colOf = (field: keyof typeof HEADER_ALIASES): number => {
    for (const alias of HEADER_ALIASES[field]) {
      const idx = headers.findIndex((h) => h.toLowerCase() === alias.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };

  // Forward-fill merged cells column-wise across data rows
  const dataRows: (string | number | Date | null)[][] = [];
  for (let r = headRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    // stop at note/blank tail: a data row must have expiry or strike
    const expiryIdx = colOf("expiry");
    const strikeIdx = colOf("strike");
    const hasLeg =
      (expiryIdx >= 0 && row[expiryIdx] != null) || (strikeIdx >= 0 && row[strikeIdx] != null);
    const isNote =
      typeof row[0] === "string" && String(row[0]).length > 60 && row[1] == null;
    if (isNote) break;
    if (!hasLeg && dataRows.length > 0 && row.every((c) => c == null)) break;
    dataRows.push([...row]);
  }
  // forward fill
  const width = Math.max(...dataRows.map((r) => r.length), headers.length);
  for (let c = 0; c < width; c++) {
    let last: string | number | Date | null = null;
    for (const row of dataRows) {
      if (row[c] != null && row[c] !== "") last = row[c];
      else if (last != null) row[c] = last;
    }
  }

  const get = (row: (string | number | Date | null)[], field: keyof typeof HEADER_ALIASES) => {
    const c = colOf(field);
    return c >= 0 ? row[c] : null;
  };

  const legs: OptionLeg[] = [];
  for (const row of dataRows) {
    const opt = get(row, "optionType");
    const strike = get(row, "strike");
    const expiry = get(row, "expiry");
    if (!opt || strike == null || expiry == null) continue;
    const qtyCell = get(row, "reqQuantity");
    if (qtyCell == null || qtyCell === "") continue;
    const rawQty = Number(qtyCell);
    if (!Number.isFinite(rawQty) || rawQty === 0) continue;
    const rowPrdPrice = get(row, "prdPrice");
    const sideRaw = String(get(row, "originalSide") ?? "").trim();
    const { side, qty } = normalizeSideAndQty(sideRaw, rawQty);
    const sd = sdCodeIdx >= 0 ? row[sdCodeIdx] : null;
    legs.push({
      optionType: String(opt).trim(),
      strike: Number(strike),
      spreads: Number(get(row, "spreads") ?? 0),
      originalSide: side,
      expiry: excelDateToIso(expiry),
      reqQuantity: qty,
      prdPrice: rowPrdPrice == null || rowPrdPrice === "" ? undefined : Number(rowPrdPrice),
      sdCode: sd == null || sd === "" ? undefined : String(sd),
    });
  }
  if (!legs.length) throw new Error("No option legs found in product master");
  const liveLegs = dedupeOptionLegs(legs);
  if (!liveLegs.length) throw new Error("No option legs found in product master");

  const first = dataRows[0];
  const num = (field: keyof typeof HEADER_ALIASES, d = 0) => {
    const v = get(first, field);
    return v == null || v === "" ? d : Number(v);
  };
  const blank = (field: keyof typeof HEADER_ALIASES) => {
    const v = get(first, field);
    return v == null || String(v).trim() === "";
  };
  if (issues) {
    const missing = SINGLE_REQUIRED_FACTS.filter(([field]) => blank(field)).map(([, header]) => header);
    if (missing.length) {
      const label = String(get(first, "productName") ?? "").trim() || "The product";
      issues.push(`${label}: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} blank.`);
    }
  }
  const initialNiftyLevel = num("initialNiftyLevel");
  const allotmentDate = excelDateToIso(get(first, "allotmentDate"));
  const maturityDate = excelDateToIso(get(first, "maturityDate"));
  const tradeDate = blank("tradeDate") ? allotmentDate : excelDateToIso(get(first, "tradeDate"));
  const contingentRaw = contingentIdx >= 0 ? first[contingentIdx] : null;
  const contingentParsed =
    contingentRaw == null || contingentRaw === "" ? 0 : Number(contingentRaw);
  const marginRaw = marginCostIdx >= 0 ? first[marginCostIdx] : null;

  const product: ProductMaster = {
    productName: String(get(first, "productName") ?? ""),
    productCode: String(get(first, "productCode") ?? ""),
    tradeDate,
    allotmentDate,
    maturityDate,
    deltaDate: tradeDate,
    // A blank Tenor Days is the allotment-to-maturity span.
    tenorDays: blank("tenorDays")
      ? Math.max(daysBetween(parseISODate(allotmentDate), parseISODate(maturityDate)), 0)
      : num("tenorDays"),
    mobilization: num("mobilization"),
    unwinds: num("unwinds"),
    initialNiftyLevel,
    contingentLevel: contingentParsed > 0 ? contingentParsed : initialNiftyLevel,
    // From the master. A blank Contingent Coupon, Margin Cost or Margin Funding Rate is 0; the
    // rest are required on upload (SINGLE_REQUIRED_FACTS), so 0 is never a silent placeholder.
    prdDiscRate: asFraction(get(first, "prdDiscRate"), 0),
    premDiscRate: asFraction(get(first, "premDiscRate"), 0),
    formulae: String(get(first, "formulae") ?? ""),
    coupon: asCoupon(get(first, "coupon"), 0),
    faceValue: num("faceValue"),
    inbuilt: asFraction(get(first, "inbuilt"), 0),
    tranCost: asFraction(get(first, "tranCost"), 0),
    issuanceCost: asFraction(get(first, "issuanceCost"), 0),
    marginCost: asFraction(marginRaw, 0),
    marginFundingRate: asFraction(get(first, "marginFundingRate"), 0),
    totalFundsForMargin: num("totalFundsForMargin"),
    prdPrice: num("prdPrice"),
    legs: liveLegs,
  };
  product.premiumFraction = bookPremiumFraction(product);
  return product;
}
