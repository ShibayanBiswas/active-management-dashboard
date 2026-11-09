/**
 * Replace Unwinding Master option expiry dates with Observation Average 1–7
 * from the Secondary SP New Primary sheet (same book the Dynamic Probability
 * Calculator reads). Match on series (unwind Product Code) + rollover phase +
 * product name. Phase 2 updates only when the unwind name says Phase 2.
 * A name with no phase is the original book and matches a blank or Phase I row.
 *
 * Nifty Accelerator 706 is the reference:
 *   26-Mar-2026 / 25-Jun-2026 / 24-Sep-2026
 *   → 30-Mar-2026 / 30-Jun-2026 / 29-Sep-2026
 */
import fs from "node:fs";
import path from "node:path";

import { optionCode } from "../lib/engine/pricer";
import type { OptionLeg, ProductMaster } from "../lib/types";
import { parseISODate } from "../lib/utils";

const SECONDARY_SEED = path.resolve(
  process.cwd(),
  process.env.NEW_PRIMARY_SEED ??
    "../Secondary SP Dashboard/lib/data/master-seed.json",
);

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

type SecondaryProduct = {
  name?: string;
  isin?: string;
  series?: string;
  raw?: Record<string, unknown>;
};

function normSeries(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[–—]/g, "-");
}

function baseName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/rollover/g, " ")
    .replace(/phase\s*(iii|ii|i|10\s*years?|[1-3])/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Blank, 1, 2, or 10. Phase II is tested before Phase I. */
function phaseToken(value: string): "" | "1" | "2" | "10" {
  const t = String(value || "").toLowerCase();
  if (/10\s*years?/.test(t)) return "10";
  if (/phase\s*(ii|2)\b/.test(t)) return "2";
  if (/phase\s*(i|1)\b/.test(t)) return "1";
  return "";
}

function parseObs(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "-" || s === "0" || s.toLowerCase() === "null") return null;
  const m = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (month == null || day < 1 || day > 31) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function observationYmds(product: SecondaryProduct): string[] {
  const raw = product.raw ?? {};
  const dates: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const ymd = parseObs(raw[`Avg. ${i}`]);
    if (ymd) dates.push(ymd);
  }
  return dates;
}

function ymdOf(iso: string): string {
  return String(iso).slice(0, 10);
}

function dayShift(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const db = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Old expiry ymd → new ISO midnight.
 * Observation Average 1–7 are the option expiry dates. Equal counts replace the
 * schedule in date order, including when the sheet still has the old Thursday
 * and the New Primary date is the exchange expiry. Unequal counts only move a
 * date onto an unused observation within 10 days, so two strikes never collapse
 * onto one day.
 */
function mapExpiries(oldYmds: string[], obsYmds: string[]): Map<string, string> {
  const obs = [...new Set(obsYmds)].sort();
  const old = [...new Set(oldYmds)].sort();
  const map = new Map<string, string>();
  const stamp = (ymd: string) => `${ymd}T00:00:00.000Z`;

  if (old.length > 0 && old.length === obs.length) {
    old.forEach((value, i) => map.set(value, stamp(obs[i]!)));
    return map;
  }

  // One observation date per old expiry so two strikes never collapse onto one day.
  const used = new Set<string>();
  for (const value of old) {
    let best: string | null = null;
    let bestAbs = 11;
    for (const next of obs) {
      if (used.has(next)) continue;
      const shift = Math.abs(dayShift(value, next));
      if (shift < bestAbs) {
        bestAbs = shift;
        best = next;
      }
    }
    if (best && bestAbs <= 10) {
      used.add(best);
      map.set(value, stamp(best));
    }
  }
  return map;
}

function uniqueExpiries(legs: OptionLeg[]): string[] {
  return [...new Set(legs.map((leg) => ymdOf(leg.expiry)))].sort();
}

export function observationBaseName(value: string): string {
  return baseName(value);
}

export function listedNewPrimaryName(hit: SecondaryProduct): string {
  return String(hit.name ?? "").trim();
}

export function indexNewPrimaryProducts(products: SecondaryProduct[]): Map<string, SecondaryProduct[]> {
  const bySeries = new Map<string, SecondaryProduct[]>();
  for (const product of products) {
    const series = normSeries(String(product.series || product.raw?.Series || ""));
    if (!series) continue;
    const list = bySeries.get(series) ?? [];
    list.push(product);
    bySeries.set(series, list);
  }
  return bySeries;
}

export function matchNewPrimaryProduct(
  product: ProductMaster,
  bySeries: Map<string, SecondaryProduct[]>,
): SecondaryProduct | null {
  return pickSecondary(product, bySeries);
}

function pickSecondary(
  product: ProductMaster,
  bySeries: Map<string, SecondaryProduct[]>,
): SecondaryProduct | null {
  const series = normSeries(product.productCode);
  const candidates = bySeries.get(series) ?? [];
  if (!candidates.length) return null;
  const wantPhase = phaseToken(product.productName);
  const wantName = baseName(product.productName);
  // Phase 2 is written on the unwind name. A name with no phase is the original
  // book and matches a blank or Phase I New Primary row, never a Phase II row.
  const phased = candidates.filter((item) => {
    const phase = phaseToken(`${item.raw?.["Rollover Phase"] ?? ""} ${item.name ?? ""}`);
    if (wantPhase === "") return phase === "" || phase === "1";
    return phase === wantPhase;
  });
  if (!phased.length) return null;
  if (phased.length === 1) return phased[0]!;
  const named = phased.filter((item) => {
    const name = baseName(String(item.raw?.["Name on Signup Form"] || item.name || ""));
    return name === wantName;
  });
  return named[0] ?? null;
}

function applyMap(product: ProductMaster, expiryMap: Map<string, string>): number {
  let changed = 0;
  for (const leg of product.legs) {
    const next = expiryMap.get(ymdOf(leg.expiry));
    if (!next || ymdOf(next) === ymdOf(leg.expiry)) continue;
    leg.expiry = next;
    leg.sdCode = optionCode(String(leg.optionType), parseISODate(next), leg.strike);
    changed += 1;
  }
  return changed;
}

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function auditUnwindExpiries(products: ProductMaster[]): {
  matched: number;
  unmatched: number;
  noSeries: number;
  phaseRejected: number;
  exact: number;
  shiftedWithin21: number;
  countMismatch: number;
  examples: string[];
} {
  if (!fs.existsSync(SECONDARY_SEED)) {
    throw new Error(`New Primary seed not found: ${SECONDARY_SEED}`);
  }
  const secondary = loadJson<{ products: SecondaryProduct[] }>(SECONDARY_SEED);
  const bySeries = new Map<string, SecondaryProduct[]>();
  for (const product of secondary.products) {
    const series = normSeries(String(product.series || product.raw?.Series || ""));
    if (!series) continue;
    const list = bySeries.get(series) ?? [];
    list.push(product);
    bySeries.set(series, list);
  }
  let matched = 0;
  let unmatched = 0;
  let noSeries = 0;
  let phaseRejected = 0;
  let exact = 0;
  let shiftedWithin21 = 0;
  let countMismatch = 0;
  const examples: string[] = [];
  for (const product of products) {
    const series = normSeries(product.productCode);
    const candidates = bySeries.get(series) ?? [];
    const hit = pickSecondary(product, bySeries);
    if (!hit) {
      unmatched += 1;
      if (!candidates.length) noSeries += 1;
      else phaseRejected += 1;
      if (examples.length < 8) {
        const phases = candidates
          .slice(0, 4)
          .map((item) => `${item.raw?.["Rollover Phase"] ?? ""}/${item.name ?? ""}`)
          .join(" ; ");
        examples.push(
          `UNMATCHED ${product.productName} | ${product.productCode} | candidates ${candidates.length} ${phases}`,
        );
      }
      continue;
    }
    matched += 1;
    const old = uniqueExpiries(product.legs);
    const obs = [...new Set(observationYmds(hit))].sort();
    const same =
      old.length === obs.length && old.every((day, i) => day === obs[i]);
    if (same) {
      exact += 1;
      continue;
    }
    if (old.length !== obs.length) countMismatch += 1;
    else shiftedWithin21 += 1;
    if (examples.length < 24) {
      examples.push(
        `DIFF ${product.productName} | ${product.productCode} | unwind ${old.join(",")} | obs ${obs.join(",")}`,
      );
    }
  }
  return { matched, unmatched, noSeries, phaseRejected, exact, shiftedWithin21, countMismatch, examples };
}

export function syncUnwindExpiries(products: ProductMaster[]): {
  matched: number;
  unmatched: number;
  productsChanged: number;
  legsChanged: number;
} {
  if (!fs.existsSync(SECONDARY_SEED)) {
    throw new Error(`New Primary seed not found: ${SECONDARY_SEED}`);
  }
  const secondary = loadJson<{ products: SecondaryProduct[] }>(SECONDARY_SEED);
  const bySeries = new Map<string, SecondaryProduct[]>();
  for (const product of secondary.products) {
    const series = normSeries(String(product.series || product.raw?.Series || ""));
    if (!series) continue;
    const list = bySeries.get(series) ?? [];
    list.push(product);
    bySeries.set(series, list);
  }

  let matched = 0;
  let unmatched = 0;
  let productsChanged = 0;
  let legsChanged = 0;
  for (const product of products) {
    const hit = pickSecondary(product, bySeries);
    if (!hit) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const expiryMap = mapExpiries(uniqueExpiries(product.legs), observationYmds(hit));
    const changed = applyMap(product, expiryMap);
    if (changed > 0) {
      productsChanged += 1;
      legsChanged += changed;
    }
  }
  return { matched, unmatched, productsChanged, legsChanged };
}

function main() {
  if (!fs.existsSync(SECONDARY_SEED)) {
    console.error(`New Primary seed not found: ${SECONDARY_SEED}`);
    process.exit(1);
  }
  const root = process.cwd();
  const multiPath = path.join(root, "lib/data/multi-products-seed.json");
  const singlePath = path.join(root, "lib/data/product-master-seed.json");
  const publicSingle = path.join(root, "public/data/product-master-seed.json");
  const multi = loadJson<ProductMaster[]>(multiPath);
  const single = loadJson<ProductMaster>(singlePath);

  const multiStats = syncUnwindExpiries(multi);
  const singleStats = syncUnwindExpiries([single]);
  const matched = multiStats.matched + singleStats.matched;
  const unmatched = multiStats.unmatched + singleStats.unmatched;
  const productsChanged = multiStats.productsChanged + singleStats.productsChanged;
  const legsChanged = multiStats.legsChanged + singleStats.legsChanged;

  const accel = multi.find((product) => product.productName.trim() === "Nifty Accelerator - 706");
  const accelDates = accel ? uniqueExpiries(accel.legs) : [];
  const expected = ["2026-03-30", "2026-06-30", "2026-09-29"];
  const accelOk = expected.every((day, i) => accelDates[i] === day) && accelDates.length === 3;
  console.log(
    JSON.stringify(
      {
        matched,
        unmatched,
        productsChanged,
        legsChanged,
        accelerator706: accelDates,
        accelerator706Ok: accelOk,
        single961: uniqueExpiries(single.legs),
      },
      null,
      2,
    ),
  );
  if (!accelOk) {
    console.error("Nifty Accelerator 706 did not land on the New Primary observation dates.");
    process.exit(1);
  }

  fs.writeFileSync(multiPath, JSON.stringify(multi));
  const prettySingle = `${JSON.stringify(single, null, 2)}\n`;
  fs.writeFileSync(singlePath, prettySingle);
  fs.writeFileSync(publicSingle, prettySingle);
  console.log("Wrote multi seed, single seed, and public single seed.");
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("sync-observation-expiries.ts")) {
  main();
}
