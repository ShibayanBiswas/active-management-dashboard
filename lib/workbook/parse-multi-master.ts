import * as XLSX from "xlsx";

import { bookPremiumFraction } from "@/lib/engine/product-premium";
import { dedupeOptionLegs } from "@/lib/multi/leg-position";
import { isinKey, uniqueProductsByIsin } from "@/lib/multi/product-key";
import type { OptionLeg, ProductMaster } from "@/lib/types";
import { daysBetween, deskTodayISO, parseISODate } from "@/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcMidnightIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T00:00:00.000Z`;
}

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

function asRate(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n > 1 ? n / 100 : n;
}

/** 1.18 stays 118%. 118 becomes 1.18. */
function asCoupon(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n > 5) return n / 100;
  return n;
}

/**
 * Normalize Required Quantity + Buy/Sell for Main Master rows.
 * When Buy/Sell is blank, trust the workbook’s already-signed quantity (Sell = negative).
 * Do not default blank → Buy and then flip negatives — that destroyed ARG26SP17-style books.
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

const COL = {
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
  sdCode: ["SD Codes", "Option Code"],
  inbuilt: ["Inbuilt Cost Rate", "Reported Inbuilt", "Inbuilt"],
  tranCost: ["Transaction Cost Rate", "Transaction Cost", "Tran Cost (%)", "Tran Cost"],
  issuanceCost: ["Issuance Cost Rate", "Issuance Cost"],
  marginCost: ["Margin Cost"],
  faceValue: ["Face Value"],
  totalFundsForMargin: ["Total Funds For Margin", "Total Funds Held for Margin", "Funds Reserved for Margin"],
  marginFundingRate: ["Margin Funding Rate"],
  premiumCredited: ["Premium Credited"],
} as const;

type ColKey = keyof typeof COL;

/** Product facts that drive valuation; a desk upload must not leave them blank. */
const REQUIRED_FACTS: Array<[ColKey, string]> = [
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

const FACT_FILL: ColKey[] = [
  "productName",
  "tradeDate",
  "productCode",
  "mobilization",
  "unwinds",
  "initialNiftyLevel",
  "contingentLevel",
  "allotmentDate",
  "tenorDays",
  "maturityDate",
  "prdDiscRate",
  "premDiscRate",
  "formulae",
  "coupon",
  "inbuilt",
  "tranCost",
  "issuanceCost",
  "marginCost",
  "faceValue",
  "totalFundsForMargin",
  "marginFundingRate",
  "premiumCredited",
];

function colOf(headers: string[], field: ColKey): number {
  for (const alias of COL[field]) {
    const idx = headers.findIndex((h) => h.toLowerCase() === alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** A live Required Quantity is a non-zero number. Sign placeholders are not legs. */
function liveRequiredQuantity(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const text = value.trim().replace(/,/g, "");
    if (!text || text === "+" || text === "-" || text === "+-" || text === "-+" || text === "+/-") return null;
    if (text.includes("+") && text.includes("-")) return null;
    const n = Number(text);
    return Number.isFinite(n) && n !== 0 ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Desk XLSM files often claim a million-row !ref; clip to actual sparse cells. */
function clipSheetUsedRange(sheet: XLSX.WorkSheet): void {
  let maxR = 0;
  let maxC = 0;
  for (const key of Object.keys(sheet)) {
    if (key[0] === "!") continue;
    const cell = XLSX.utils.decode_cell(key);
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c > maxC) maxC = cell.c;
  }
  if (maxR <= 0 && maxC <= 0) return;
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: Math.max(maxC, 55) },
  });
}

function looksLikeMasterHeader(row: (string | number | Date | null)[] | undefined): boolean {
  if (!row?.length) return false;
  const cells = row.map((c) => String(c ?? "").trim().toLowerCase());
  const hasProduct = cells.some((c) => c === "product name" || c === "product");
  const hasStrike = cells.some(
    (c) => c === "strike price" || c === "req. strike" || c === "strike" || c.includes("strike"),
  );
  return hasProduct && hasStrike;
}

/**
 * Parse every product on a Main Master File (or 28-column sample) into separate books.
 * Does not replace the single-product parser.
 */
/**
 * `issues`: when given, every product missing a valuation fact (dates, Initial Underlying Level,
 * Face Value, Contingent Coupon, costs, Margin Funding Rate) is reported there instead of parsed
 * with a placeholder. Desk uploads pass it and reject on any issue.
 */
export function parseProductMasterBook(buffer: ArrayBuffer | Buffer, issues?: string[]): ProductMaster[] {
  const kind = typeof Buffer !== "undefined" && Buffer.isBuffer(buffer) ? "buffer" : "array";
  const namesWb = XLSX.read(buffer, { type: kind, bookSheets: true, bookProps: true });
  const preferred =
    namesWb.SheetNames.find((n) => /^main master/i.test(n.trim())) ??
    namesWb.SheetNames.find((n) => /master/i.test(n)) ??
    namesWb.SheetNames[0];
  const wb = XLSX.read(buffer, {
    type: kind,
    cellDates: true,
    sheets: preferred ? [preferred] : undefined,
  });
  const ranked = [...wb.SheetNames].sort((a, b) => {
    const rank = (n: string) => (/^main master/i.test(n.trim()) ? 2 : /master/i.test(n) ? 1 : 0);
    return rank(b) - rank(a);
  });
  let headRow = -1;
  let grid: (string | number | Date | null)[][] = [];
  let headers: string[] = [];
  for (const name of ranked) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    clipSheetUsedRange(sheet);
    grid = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    // Header may sit in column A (samples) or column B (legacy desk XLSM).
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      if (!looksLikeMasterHeader(grid[i])) continue;
      headRow = i;
      headers = (grid[i] ?? []).map((h) => String(h ?? "").trim());
      break;
    }
    if (headRow >= 0) break;
  }
  if (headRow < 0) throw new Error("Product master header row not found");

  const idx = (field: ColKey) => colOf(headers, field);
  const dataRows: (string | number | Date | null)[][] = [];
  const expiryIdx = idx("expiry");
  const strikeIdx = idx("strike");
  for (let r = headRow + 1; r < grid.length; r++) {
    const row = [...(grid[r] ?? [])];
    const first = String(row[0] ?? "").trim();
    if (first.length > 80 && row.slice(1).every((c) => c == null || c === "")) break;
    const hasLeg =
      (expiryIdx >= 0 && row[expiryIdx] != null) || (strikeIdx >= 0 && row[strikeIdx] != null);
    if (!hasLeg && dataRows.length > 0 && row.every((c) => c == null || c === "")) break;
    if (!hasLeg && !String(row[idx("productName")] ?? "").trim() && !String(row[idx("productCode")] ?? "").trim()) {
      continue;
    }
    dataRows.push(row);
  }

  function rowIsinKey(row: (string | number | Date | null)[]): string {
    const name = String(row[idx("productName")] ?? "").trim();
    const code = String(row[idx("productCode")] ?? "").trim();
    return isinKey({ productName: name, productCode: code });
  }

  function fillColumn(field: ColKey, scoped: boolean) {
    const c = idx(field);
    if (c < 0) return;
    let last: string | number | Date | null = null;
    let lastKey = "";
    for (const row of dataRows) {
      const name = String(row[idx("productName")] ?? "").trim();
      const key = rowIsinKey(row);
      const cell = row[c];
      if (cell != null && cell !== "") {
        last = cell;
        lastKey = key;
      } else if (last != null && (!scoped || key === lastKey || !name)) {
        row[c] = last;
      }
    }
  }
  fillColumn("productName", false);
  fillColumn("productCode", false);
  // Nifty Accelerator 814's later rows keep the name 814 but the code cell is the
  // previous product's code. While the name stays the same, keep the code from
  // the first row of that name. A new name starts a new code, so the next product
  // is left alone.
  const nameCol = idx("productName");
  const codeCol = idx("productCode");
  if (nameCol >= 0 && codeCol >= 0) {
    let blockName = "";
    let blockCode = "";
    for (const row of dataRows) {
      const name = String(row[nameCol] ?? "").trim();
      const code = String(row[codeCol] ?? "").trim();
      if (!name || !code) continue;
      if (name !== blockName) {
        blockName = name;
        blockCode = code;
        continue;
      }
      if (code !== blockCode) row[codeCol] = blockCode;
    }
  }
  for (const field of FACT_FILL) {
    if (field === "productName" || field === "productCode") continue;
    fillColumn(field, true);
  }
  fillColumn("optionType", true);
  fillColumn("strike", true);
  fillColumn("spreads", true);
  fillColumn("originalSide", true);

  // Group by Product Code (ISIN) only — same code with different name spellings stays one product.
  const groups = new Map<string, (string | number | Date | null)[][]>();
  const order: string[] = [];
  for (const row of dataRows) {
    const name = String(row[idx("productName")] ?? "").trim();
    const code = String(row[idx("productCode")] ?? "").trim();
    if (!name && !code) continue;
    const key = rowIsinKey(row);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  }

  const products: ProductMaster[] = [];
  for (const key of order) {
    const rows = groups.get(key) ?? [];
    const first = rows[0];
    if (!first) continue;
    const get = (field: ColKey) => {
      const c = idx(field);
      return c >= 0 ? first[c] : null;
    };
    const legs: OptionLeg[] = [];
    for (const row of rows) {
      const opt = idx("optionType") >= 0 ? row[idx("optionType")] : null;
      const strike = idx("strike") >= 0 ? row[idx("strike")] : null;
      const expiry = idx("expiry") >= 0 ? row[idx("expiry")] : null;
      if (!opt || strike == null || expiry == null) continue;
      const qtyCell = idx("reqQuantity") >= 0 ? row[idx("reqQuantity")] : null;
      // Blank, zero, and "+" / "-" / "+-" placeholders are unused expiry slots.
      const rawQty = liveRequiredQuantity(qtyCell);
      if (rawQty == null) continue;
      const sideRaw = String(idx("originalSide") >= 0 ? row[idx("originalSide")] ?? "" : "").trim();
      const { side, qty } = normalizeSideAndQty(sideRaw, rawQty);
      const rowPrice = idx("prdPrice") >= 0 ? row[idx("prdPrice")] : null;
      const sd = idx("sdCode") >= 0 ? row[idx("sdCode")] : null;
      legs.push({
        optionType: String(opt).trim(),
        strike: Number(strike),
        spreads: num(idx("spreads") >= 0 ? row[idx("spreads")] : 0),
        originalSide: side,
        expiry: excelDateToIso(expiry),
        reqQuantity: qty,
        prdPrice: rowPrice == null || rowPrice === "" ? undefined : Number(rowPrice),
        sdCode: sd == null || sd === "" ? undefined : String(sd),
      });
    }
    const liveLegs = dedupeOptionLegs(legs);
    if (!liveLegs.length) continue;
    const blank = (field: ColKey) => {
      const v = get(field);
      return v == null || String(v).trim() === "";
    };
    if (issues) {
      const label = String(get("productName") ?? "").trim() || String(get("productCode") ?? "").trim();
      const missing = REQUIRED_FACTS.filter(([field]) => blank(field)).map(([, header]) => header);
      if (missing.length) issues.push(`${label}: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} blank.`);
    }
    const trade = excelDateToIso(blank("tradeDate") ? get("allotmentDate") : get("tradeDate"));
    const allotment = excelDateToIso(get("allotmentDate") ?? get("tradeDate"));
    const maturity = excelDateToIso(get("maturityDate"));
    const contingentRaw = get("contingentLevel");
    const mobilization = num(get("mobilization"));
    const product: ProductMaster = {
      productName: String(get("productName") ?? ""),
      productCode: String(get("productCode") ?? ""),
      tradeDate: trade,
      allotmentDate: allotment,
      maturityDate: maturity,
      deltaDate: trade,
      // A blank Tenor Days is the allotment-to-maturity span.
      tenorDays: blank("tenorDays")
        ? Math.max(daysBetween(parseISODate(allotment), parseISODate(maturity)), 0)
        : num(get("tenorDays")),
      mobilization,
      unwinds: num(get("unwinds")),
      initialNiftyLevel: num(get("initialNiftyLevel")),
      contingentLevel: (() => {
        const contingent = num(contingentRaw);
        return contingent > 0 ? contingent : num(get("initialNiftyLevel"));
      })(),
      // Facts below come from the master. A blank Contingent Coupon, Margin Cost or Margin
      // Funding Rate is 0 (participation payoffs carry no fixed coupon); the rest are
      // required on upload (REQUIRED_FACTS), so 0 is never a silent placeholder.
      prdDiscRate: asRate(get("prdDiscRate"), 0),
      premDiscRate: asRate(get("premDiscRate"), 0),
      formulae: String(get("formulae") ?? ""),
      coupon: asCoupon(get("coupon"), 0),
      faceValue: num(get("faceValue")),
      inbuilt: asRate(get("inbuilt"), 0),
      tranCost: asRate(get("tranCost"), 0),
      issuanceCost: asRate(get("issuanceCost"), 0),
      marginCost: asRate(get("marginCost"), 0),
      marginFundingRate: asRate(get("marginFundingRate"), 0),
      totalFundsForMargin: num(get("totalFundsForMargin")),
      prdPrice: num(get("prdPrice")),
      legs: liveLegs,
    };
    product.premiumFraction = bookPremiumFraction(product);
    if (!product.productName || !product.productCode) continue;
    products.push(product);
  }
  const unique = uniqueProductsByIsin(products);
  if (!unique.length) throw new Error("No products found in the Product Master");
  return unique;
}
