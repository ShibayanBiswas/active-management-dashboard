/**
 * End-to-end pricing audit: vol, BS price/delta, unwind marks, and
 * distinct live deltas across *different expiries* for the same strike+type.
 * (Buy and Sell of the same Put share the same BS delta — that is correct.)
 */
import productSeed from "../lib/data/product-master-seed.json";
import multiSeed from "../lib/data/multi-products-seed.json";
import volSeed from "../lib/data/vol-surface-golden-sep-2026.json";
// September 2026 golden surface: the parity locks stay on it when the monthly seed moves on.
import { computeUnwind } from "../lib/engine/unwind";
import { priceLeg, priceProductBook } from "../lib/engine/pricer";
import { interpolateVolPercent, AUGUST_REFERENCE_UNDERLYING_PRICE } from "../lib/engine/vol-surface";
import { issuedCount } from "../lib/multi/product-key";
import type { OptionLeg, ProductMaster, VolSurface } from "../lib/types";
import { parseISODate, underlyingFromProductName } from "../lib/utils";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const surface = volSeed as VolSurface;
const single = productSeed as ProductMaster;
const multi = multiSeed as ProductMaster[];

const GOLDEN = {
  valuationDate: "2025-02-21",
  spot: 22800,
  // First expiry is the New Primary observation 23-Feb-2027 (was 25-Feb-2027 on the XLSM).
  code0: "P4644123408",
  vol0: 0.1301982918496008,
  price0: 684.61,
  delta0: -0.24727350119678704,
  discountYield: 0.076, // Forward Sell 6.60% + 1%
};

/** For each strike+type, deltas must differ across distinct expiries. */
function repeatedDeltaAcrossExpiries(
  rows: Array<{ strike: number; optionType: string; maturity: string; delta: number; expired?: boolean }>,
): number {
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.expired) continue;
    const key = `${row.optionType}|${row.strike}`;
    const byExpiry = groups.get(key) ?? new Map<string, number>();
    const exp = row.maturity.slice(0, 10);
    const prev = byExpiry.get(exp);
    if (prev != null && Math.abs(prev - row.delta) > 1e-10) {
      return 1;
    }
    byExpiry.set(exp, row.delta);
    groups.set(key, byExpiry);
  }
  let bad = 0;
  for (const byExpiry of groups.values()) {
    if (byExpiry.size < 2) continue;
    const deltas = [...byExpiry.values()].map((d) => d.toFixed(8));
    if (new Set(deltas).size !== deltas.length) bad += 1;
  }
  return bad;
}

console.log("=== Single 961 — vol / BS / unwind marks ===");
const book = priceProductBook({
  product: single,
  surface,
  valuationDate: GOLDEN.valuationDate,
  spot: GOLDEN.spot,
  bidAskSpread: 0,
});
check("pricer returns 24 legs", book.length === 24, String(book.length));
check("unique option codes", new Set(book.map((r) => r.code)).size === 24);

const first = book.find((r) => r.code === GOLDEN.code0);
check("first leg present", Boolean(first));
if (first) {
  check("vol interpolation exact", Math.abs(first.volatility - GOLDEN.vol0) < 1e-12, String(first.volatility));
  check("BS mid price exact", Math.abs(first.price - GOLDEN.price0) < 1e-9, String(first.price));
  check("BS delta exact", Math.abs(first.delta - GOLDEN.delta0) < 1e-12, String(first.delta));
  check("discount yield = fwd 6.60% + 1%", Math.abs(first.discountYield - GOLDEN.discountYield) < 1e-12);
}

const strike23408 = book.filter((r) => r.strike === 23408);
check("23408 has 4 expiries", strike23408.length === 4, String(strike23408.length));
check(
  "23408 distinct vols across expiries",
  new Set(strike23408.map((r) => r.volatility.toFixed(12))).size === 4,
);
check(
  "23408 distinct deltas across expiries",
  new Set(strike23408.map((r) => r.delta.toFixed(12))).size === 4,
);
const strike22880 = book.filter((r) => r.strike === 22880);
check(
  "22880 distinct deltas across expiries",
  new Set(strike22880.map((r) => r.delta.toFixed(12))).size === strike22880.length,
  `${new Set(strike22880.map((r) => r.delta.toFixed(12))).size}/${strike22880.length}`,
);

const liveBook = priceProductBook({
  product: single,
  surface,
  valuationDate: "2026-08-17",
  spot: 24366,
  bidAskSpread: 0,
});
check(
  "live single: deltas differ across expiries (same strike+type)",
  repeatedDeltaAcrossExpiries(liveBook) === 0,
);

const unwind = computeUnwind({
  product: single,
  surface,
  inputs: {
    debentures: 800,
    unwindDate: GOLDEN.valuationDate,
    spot: GOLDEN.spot,
    underlying: "Nifty",
    bidAskSpread: 0,
  },
});
check("unwind option rows = 24", unwind.optionRows.length === 24);
// Original Sell unwinds as Buy → Pricer Buy Price, signed negative on the Options Book.
check(
  "unwind mark matches pricer buy for original sell",
  Math.abs((unwind.optionRows[0]?.unwindPrice ?? 0) - -GOLDEN.price0) < 0.05,
  String(unwind.optionRows[0]?.unwindPrice),
);
check(
  "every unwind mark finite",
  unwind.optionRows.every((r) => Number.isFinite(r.unwindPrice) && Number.isFinite(r.premiumOutflowRs)),
);

console.log("\n=== Multi book — sample products pricing + delta variety ===");
const AS_OF = "2026-08-17";
const NIFTY = 24366;
const SENSEX = 78009.25;
let multiPriceFails = 0;
let multiDeltaFails = 0;
const sampleNeedles = ["1567", "1684", "359", "1619", "1664", "1605"];
const sampleProducts = sampleNeedles
  .map((needle) => multi.find((p) => p.productName.includes(needle)))
  .filter((p): p is ProductMaster => Boolean(p));
for (const product of sampleProducts) {
  const underlying = underlyingFromProductName(product.productName, product.productCode);
  const spot = underlying === "Sensex" ? SENSEX : NIFTY;
  try {
    const priced = priceProductBook({
      product,
      surface,
      valuationDate: AS_OF,
      spot,
      bidAskSpread: 0,
      underlying,
    });
    check(
      `multi ${product.productName} priced legs match book`,
      priced.length === product.legs.length,
      `${priced.length} vs ${product.legs.length}`,
    );
    const livePriced = priced.filter((row) => {
      const tau = (parseISODate(row.maturity).getTime() - parseISODate(AS_OF).getTime()) / 86_400_000;
      return tau > 0;
    });
    if (livePriced.length >= 2) {
      const bad = repeatedDeltaAcrossExpiries(livePriced);
      if (bad) {
        multiDeltaFails += bad;
        console.log(`FAIL multi ${product.productName} repeated deltas across expiries count=${bad}`);
      }
    }
    const result = computeUnwind({
      product,
      surface,
      inputs: {
        debentures: issuedCount(product),
        unwindDate: AS_OF,
        spot,
        underlying,
        nifty: NIFTY,
        sensex: SENSEX,
        bidAskSpread: 0,
      },
    });
    if (
      !Number.isFinite(result.unwindQuoteRs) ||
      result.optionRows.length !== product.legs.length ||
      !result.optionRows.every((r) => Number.isFinite(r.unwindPrice))
    ) {
      multiPriceFails += 1;
    }
  } catch (err) {
    multiPriceFails += 1;
    console.log(`FAIL multi ${product.productName} threw`, err instanceof Error ? err.message : err);
  }
}
check("multi sampled products price cleanly", multiPriceFails === 0, String(multiPriceFails));
check(
  "multi sampled: deltas differ across expiries (same strike+type)",
  multiDeltaFails === 0,
  String(multiDeltaFails),
);

const expiryA = parseISODate("2027-02-25");
const expiryB = parseISODate("2027-11-25");
const volA = interpolateVolPercent(surface, AUGUST_REFERENCE_UNDERLYING_PRICE, expiryA, 23408, "Nifty");
const volB = interpolateVolPercent(surface, AUGUST_REFERENCE_UNDERLYING_PRICE, expiryB, 23408, "Nifty");
check("vol differs across expiries for same strike", Math.abs(volA - volB) > 1e-6, `${volA} vs ${volB}`);

const stubLeg = (expiry: string): OptionLeg => ({
  optionType: "Put",
  strike: 23408,
  spreads: 1,
  originalSide: "Sell",
  expiry,
  reqQuantity: -1,
  prdPrice: 0,
});
const legA = priceLeg({
  leg: stubLeg("2027-02-25T00:00:00.000Z"),
  surface,
  valuationDate: parseISODate(AS_OF),
  spot: NIFTY,
  bidAskSpread: 0,
});
const legB = priceLeg({
  leg: stubLeg("2027-11-25T00:00:00.000Z"),
  surface,
  valuationDate: parseISODate(AS_OF),
  spot: NIFTY,
  bidAskSpread: 0,
});
check(
  "BS delta differs across expiries same strike",
  Math.abs(legA.delta - legB.delta) > 1e-6,
  `${legA.delta} vs ${legB.delta}`,
);
check(
  "BS price differs across expiries same strike",
  Math.abs(legA.price - legB.price) > 1e-6,
  `${legA.price} vs ${legB.price}`,
);

if (failures > 0) {
  console.error(`\nPricing audit FAILED (${failures})`);
  process.exit(1);
}
console.log("\nPricing audit PASSED");
