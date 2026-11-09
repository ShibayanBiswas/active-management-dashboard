/**
 * Pricer row checks — golden cached rows at valuation date 21-Feb-2025, spot 22800.
 * Verifies volatility interpolation, the discount-yield convention (forward sell
 * rate plus one percent) and the Black–Scholes price and delta per option code.
 */
import { priceLeg, priceProductBook } from "../lib/engine/pricer";
import { parseISODate } from "../lib/utils";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-golden-sep-2026.json";
// September 2026 golden surface: the parity locks stay on it when the monthly seed moves on.
import type { ProductMaster, VolSurface } from "../lib/types";

const product = productSeed as unknown as ProductMaster;
const surface = volSeed as unknown as VolSurface;

const VALUATION = parseISODate("2025-02-21");
const SPOT = 22800;

type GoldenRow = { code: string; vol: number; price: number; delta: number };

const GOLDEN_ROWS: GoldenRow[] = [
  { code: "P4644123408", vol: 0.1301982918496008, price: 684.61, delta: -0.24727350119678704 },
  { code: "P4653223408", vol: 0.13594790155043873, price: 719.85, delta: -0.2359160708984973 },
  { code: "P4663023408", vol: 0.14177966670814135, price: 756.2, delta: -0.22534911721163553 },
  { code: "P4672123408", vol: 0.14683552086909693, price: 787.69, delta: -0.21662875995320974 },
  { code: "P4644122880", vol: 0.13522577583153925, price: 598.55, delta: -0.21666609186604546 },
  { code: "P4653222880", vol: 0.1405938688716134, price: 635.76, delta: -0.20887425244006863 },
  { code: "P4663022880", vol: 0.14616699327617522, price: 674.71, delta: -0.2014563437404604 },
  { code: "P4672122880", vol: 0.1509682867565014, price: 707.83, delta: -0.19505504606775048 },
  { code: "P4644119008", vol: 0.19964900850897632, price: 359.79, delta: -0.10303605558146955 },
  { code: "P4653219008", vol: 0.19263252721955382, price: 341.61, delta: -0.09667382348965248 },
];

let failures = 0;
function assertClose(name: string, actual: number, expected: number, tol: number) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: actual=${actual} expected=${expected} tol=${tol}`);
  if (!ok) failures += 1;
}

for (const golden of GOLDEN_ROWS) {
  const leg = product.legs.find((l) => l.sdCode === golden.code);
  if (!leg) {
    console.log(`FAIL missing leg for ${golden.code}`);
    failures += 1;
    continue;
  }
  const row = priceLeg({ leg, spot: SPOT, valuationDate: VALUATION, surface });
  assertClose(`${golden.code} volatility`, row.volatility, golden.vol, 1e-9);
  assertClose(`${golden.code} discount yield`, row.discountYield, 0.076, 1e-12);
  assertClose(`${golden.code} price`, row.price, golden.price, 0.01);
  assertClose(`${golden.code} delta`, row.delta, golden.delta, 1e-4);
}

const book = priceProductBook({
  product,
  surface,
  spot: SPOT,
  valuationDate: "2025-02-21",
  bidAskSpread: 0,
});
assertClose("pricer book rows", book.length, 24, 0);
const codes = new Set(book.map((r) => r.code));
assertClose("unique option codes", codes.size, 24, 0);
const firstStrikeDeltas = book.filter((r) => r.strike === 23408).map((r) => r.delta);
assertClose("23408 expiry count", firstStrikeDeltas.length, 4, 0);
const distinctDeltas = new Set(firstStrikeDeltas.map((d) => d.toFixed(4))).size;
assertClose("23408 distinct deltas", distinctDeltas, 4, 0);

if (failures > 0) {
  console.error(`\nPricer row checks FAILED (${failures})`);
  process.exit(1);
}
console.log("\nPricer row checks PASSED");
