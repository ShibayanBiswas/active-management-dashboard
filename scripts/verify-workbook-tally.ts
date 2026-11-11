/**
 * Workbook tally, offline: the Active Management engine against the reference workbook
 * (Mar26 Unwind Calculator Auto Surface_Oct _3110.xlsx) through scripts/fixtures/workbook-tally.json.
 *
 * Engine parity: each workbook product, built from its own List of Products legs and Calculator
 * facts, priced on the workbook's own Surface sheet at its valuation date (29-Oct-2026) and Nifty
 * (22,700), forward 5.5% and discount 6.5%, with the Bid Ask table spread per leg:
 * - side vol (surface ± s) against Px. Comput K, and the Options Book mark against List of Products AX;
 * - the AZ carry against Σ List of Products AZ;
 * - the book IRR against Calculator U, with the workbook's own quirks put back: AZ only where
 *   Calculator K carries it (not rows 48 and 65, bug B9), legs Excel prices at vol 0 (bug B10) at
 *   Excel's cash, and the signed Calculator G premium (row 247).
 * App as shipped: the seed product matched by name, alias and code:
 * - Actual Target against Calculator AR;
 * - Effective Target against Calculator AS under the workbook's fixing rule (a passed date counts
 *   only when Bid Ask J:K holds its exact close; product 715 is the known miss, its seed has a stray leg);
 * - Expected Difference at Maturity against the tally's three worked numbers.
 * Exits non-zero when a documented rate is not met.
 */
import tally from "./fixtures/workbook-tally.json";
import multiSeed from "../lib/data/multi-products-seed.json";
import { bidAskSpreadPercent } from "../lib/active-management/bid-ask";
import { settledOutflowCarryRs } from "../lib/active-management/book-value";
import { expectedDifferenceAtMaturity } from "../lib/active-management/maturity";
import { observationFacts } from "../lib/active-management/observations";
import { actualTargetFor } from "../lib/active-management/target-seed";
import { priceLeg, unwindMarkPrice } from "../lib/engine/pricer";
import { computeUnwind, rateZeroCoupon } from "../lib/engine/unwind";
import { surfaceVolDecimal } from "../lib/engine/vol-surface";
import type { OptionLeg, ProductMaster, VolSurface } from "../lib/types";
import { daysBetween, parseISODate } from "../lib/utils";

type Leg = [string, number, number, string, string, number, number, number | null, number | null, number | null];
type TallyProduct = {
  row: number;
  name: string;
  alias: string | null;
  code: string;
  product: Omit<ProductMaster, "productName" | "productCode" | "deltaDate" | "unwinds" | "formulae" | "marginCost" | "legs">;
  legs: Leg[];
  excel: { G: number | null; U: number | null; AR: number | null; AS: number | null; sumAZ: number; azInK: boolean };
};

const T = tally as unknown as {
  valuationDate: string;
  spot: number;
  forwardGrowth: number;
  surface: { anchor: number; moneynessPct: number[]; expiries: string[]; volsPercent: number[][] };
  closes: Record<string, number>;
  hardFixings: Record<string, number>;
  products: TallyProduct[];
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const VAL = T.valuationDate;
const SPOT = T.spot;
const valuation = parseISODate(VAL);

/** The workbook Surface sheet as an engine surface. The Deep ₹500 column repeats the 55% vol, as the seed does. */
const moneyness = T.surface.moneynessPct.map((x) => Math.round(x * 1e6) / 1e8);
const SURFACE: VolSurface = {
  monthKey: "2026-10",
  label: "Workbook Surface (Mar26 Unwind Calculator)",
  deepStrike: 500,
  moneyness,
  strikes: [500, ...moneyness],
  expiries: T.surface.expiries.map((d) => `${d}T00:00:00.000Z`),
  volsPercent: T.surface.volsPercent.map((row) => [row[0]!, ...row]),
  pricingParams: [{ date: `${T.surface.expiries[0]}T00:00:00.000Z`, volBump: 0, fwdSellRate: T.forwardGrowth }],
  referenceUnderlyingPrice: T.surface.anchor,
};

const closeDays = Object.keys(T.closes).sort();
/** Close on or before the day (the app's Yahoo rule) from Bid Ask J:K, with the workbook's typed fixings on top. */
function closeOnOrBefore(day: string): number | null {
  if (T.hardFixings[day] != null) return T.hardFixings[day]!;
  if (day > "2026-10-27") return T.hardFixings["2026-10-27"]!;
  let best: string | null = null;
  for (const d of closeDays) {
    if (d > day) break;
    best = d;
  }
  return best == null ? null : T.closes[best]!;
}
function fixingsFor(product: ProductMaster): Record<string, number> {
  const out: Record<string, number> = {};
  for (const leg of product.legs) {
    const day = String(leg.expiry).slice(0, 10);
    if (day > VAL) continue;
    const close = closeOnOrBefore(day);
    if (close != null) out[day] = close;
  }
  return out;
}

function workbookProduct(p: TallyProduct): ProductMaster {
  return {
    ...p.product,
    productName: p.name,
    productCode: p.code,
    deltaDate: p.product.tradeDate,
    unwinds: 0,
    formulae: "",
    // Calculator E has no margin cost term, and List of Products AF is 0 on every leg.
    marginCost: 0,
    legs: p.legs.map(([optionType, strike, spreads, originalSide, expiry, reqQuantity, prdPrice]) => ({
      optionType,
      strike,
      spreads,
      originalSide,
      expiry: `${expiry}T00:00:00.000Z`,
      reqQuantity,
      prdPrice,
    })),
  };
}

const inBook = (leg: OptionLeg, qtyDriven: boolean) =>
  !qtyDriven || (leg.reqQuantity != null && Number.isFinite(leg.reqQuantity) && leg.reqQuantity !== 0);

// Engine parity on the workbook's own products.
{
  let sideLegs = 0;
  let sideOk = 0;
  let markLegs = 0;
  let markOk = 0;
  let azOk = 0;
  let uOk = 0;
  let uCompared = 0;
  const azMiss: string[] = [];
  const uMiss: string[] = [];
  for (const p of T.products) {
    const product = workbookProduct(p);
    const fixings = fixingsFor(product);
    const result = computeUnwind({
      product,
      surface: SURFACE,
      inputs: {
        debentures: product.mobilization / product.faceValue,
        unwindDate: VAL,
        spot: SPOT,
        nifty: SPOT,
        underlying: "Nifty",
        expirySpots: fixings,
      },
    });
    const qtyDriven = product.legs.some((leg) => inBook(leg, false));
    const booked = p.legs.filter((_, i) => inBook(product.legs[i]!, qtyDriven));
    const bookedLegs = product.legs.filter((leg) => inBook(leg, qtyDriven));
    if (booked.length !== result.optionRows.length) throw new Error(`${p.name}: Options Book rows out of step`);

    let cash = 0;
    result.optionRows.forEach((row, i) => {
      const [, , , side, expiry, , , excelK, excelAX, excelAY] = booked[i]!;
      const leg = bookedLegs[i]!;
      const live = !row.expired;
      const excelPriced = excelK != null && excelK > 0;
      if (live && excelPriced) {
        const s = bidAskSpreadPercent(expiry) / 100;
        const { vol } = surfaceVolDecimal(SURFACE, leg.strike, parseISODate(expiry), SPOT, "Nifty");
        const sideVol = /^b/i.test(side) ? vol - s : vol + s;
        sideLegs += 1;
        if (Math.abs(sideVol - excelK) <= 1e-12) sideOk += 1;
        if (excelAX != null) {
          markLegs += 1;
          const priced = priceLeg({ leg, spot: SPOT, valuationDate: valuation, surface: SURFACE, underlying: "Nifty" });
          if (Math.abs(unwindMarkPrice(priced, side) - excelAX) <= 0.01) markOk += 1;
        }
      }
      // Excel prices a live leg at vol 0 when its expiry is off the Bid Ask sheet or its strike is off the surface (B10).
      cash += live && !excelPriced ? excelAY ?? 0 : row.premiumOutflowRs;
    });

    const az = settledOutflowCarryRs(product, result);
    if (Math.abs(az - p.excel.sumAZ) <= 1) azOk += 1;
    else azMiss.push(`${p.row} ${p.name} ${az.toFixed(2)} vs ${p.excel.sumAZ.toFixed(2)}`);

    if (p.excel.U != null) {
      uCompared += 1;
      const premiumSign = p.excel.G != null && p.excel.G < 0 ? -1 : 1;
      const value =
        result.masterEconomics.grownValueRs +
        premiumSign * result.masterEconomics.premGrownValueRs +
        cash +
        (p.excel.azInK ? az : 0);
      const u = rateZeroCoupon(result.investedTenorDays / 365, product.faceValue, value / result.totalDebs);
      if (Math.abs(u - p.excel.U) <= 1e-4) uOk += 1;
      else uMiss.push(`${p.row} ${p.name} ${(u * 100).toFixed(4)}% vs ${(p.excel.U * 100).toFixed(4)}%`);
    }
  }
  check("side vol (surface ± Bid Ask s) equals Px. Comput K", sideLegs === 3043 && sideOk === sideLegs, `${sideOk} of ${sideLegs} live legs`);
  check("Options Book mark equals List of Products AX within a paisa", markLegs === 3043 && markOk === markLegs, `${markOk} of ${markLegs}`);
  check("AZ carry equals Σ List of Products AZ within ₹1", azOk === T.products.length, `${azOk} of ${T.products.length} ${azMiss.slice(0, 5).join("; ")}`);
  check(
    "book IRR with the spread and AZ equals Calculator U within 1 bp",
    uCompared === 346 && uOk === uCompared,
    `${uOk} of ${uCompared} ${uMiss.slice(0, 5).join("; ")}`,
  );
}

// App as shipped: targets on the seed products the workbook tracks (Calculator rows 3–197).
{
  const seed = multiSeed as unknown as ProductMaster[];
  const byName = new Map<string, ProductMaster[]>();
  for (const sp of seed) {
    const key = sp.productName.trim();
    byName.set(key, [...(byName.get(key) ?? []), sp]);
  }
  const seedFor = (p: TallyProduct): ProductMaster | null => {
    const code = p.code.trim().toUpperCase();
    for (const name of [p.name, p.alias]) {
      const hits = name ? byName.get(name) : undefined;
      if (hits?.length) return hits.find((sp) => sp.productCode.trim().toUpperCase() === code) ?? hits[0]!;
    }
    return null;
  };
  let targets = 0;
  let targetOk = 0;
  let effective = 0;
  let effectiveOk = 0;
  const targetMiss: string[] = [];
  const effectiveMiss: string[] = [];
  for (const p of T.products) {
    if (p.row > 197) continue;
    const sp = seedFor(p);
    if (!sp) continue;
    const target = actualTargetFor(sp).target;
    if (p.excel.AR != null) {
      targets += 1;
      if (target != null && Math.abs(target - p.excel.AR) <= 0.01) targetOk += 1;
      else targetMiss.push(`${p.row} ${p.name} ${target} vs ${p.excel.AR}`);
    }
    if (p.excel.AS != null) {
      effective += 1;
      const facts = observationFacts(sp, VAL, fixingsFor(sp), "2099-01-01");
      const exact = facts.points.filter((pt) => pt.passed && T.closes[pt.date] != null);
      const left = facts.total - exact.length;
      const sum = exact.reduce((s, pt) => s + T.closes[pt.date]!, 0);
      const got = target != null && left > 0 ? (target * facts.total - sum) / left : null;
      if (got != null && Math.abs(got - p.excel.AS) <= 0.01) effectiveOk += 1;
      else effectiveMiss.push(`${p.row} ${p.name} ${got?.toFixed(2)} vs ${p.excel.AS.toFixed(2)}`);
    }
  }
  check("Actual Target equals Calculator AR", targets === 127 && targetOk === targets, `${targetOk} of ${targets} ${targetMiss.join("; ")}`);
  check(
    "Effective Target equals Calculator AS under the workbook fixing rule (715 is the known miss)",
    effective === 81 && effectiveOk === 80 && effectiveMiss.length === 1 && effectiveMiss[0]!.includes("Nifty Accelerator - 715"),
    `${effectiveOk} of ${effective} ${effectiveMiss.join("; ")}`,
  );

  // Expected Difference at Maturity: the tally's worked numbers, on the workbook date, Nifty and surface.
  const worked: Array<[string, string, number]> = [
    ["Nifty Accelerator - 880", "ARFS23SP11 Series I", -6_918_142.13],
    ["Nifty Accelerator - 788", "ARG23SP42 Series IV", -2_164_591.86],
    ["Nifty Accelerator - 664", "ARG22SP70 - Series VI", -60_368_319.52],
  ];
  const lines: string[] = [];
  let edOk = 0;
  for (const [name, code, want] of worked) {
    const sp = seed.find((x) => x.productName.trim() === name && x.productCode.trim() === code);
    if (!sp) {
      lines.push(`${name} not in the seed`);
      continue;
    }
    const inputs = {
      debentures: sp.mobilization / sp.faceValue,
      unwindDate: VAL,
      spot: SPOT,
      nifty: SPOT,
      underlying: "Nifty" as const,
      expirySpots: fixingsFor(sp),
    };
    // The table spread and an explicit 0 give the same figure: it reads mid marks only.
    const withTable = expectedDifferenceAtMaturity(sp, computeUnwind({ product: sp, surface: SURFACE, inputs }), SURFACE);
    const withZero = expectedDifferenceAtMaturity(sp, computeUnwind({ product: sp, surface: SURFACE, inputs: { ...inputs, bidAskSpread: 0 } }), SURFACE);
    if (withTable === want && withZero === want) edOk += 1;
    lines.push(`${name} ${withTable}`);
  }
  check("Expected Difference equals the tally's worked numbers (880, 788, 664)", edOk === worked.length, lines.join("; "));
}

console.log(failures ? `\n${failures} workbook tally checks FAILED` : "\nWorkbook tally checks PASSED");
if (failures) process.exit(1);
