/**
 * Active Management add-ons on the seeded live book, offline: the design test plan (observation facts,
 * Residual Target parity, Max IRR, the scenario ladder, expired legs, Sensex shift, missing closes,
 * Pricer alignment, flat ladders), the Actual Target seed, the Product Book composer, the Bid Ask
 * table, Expected Difference at Maturity, Pending Observations, scenario Expected Difference and the
 * book scenario rows. As-of, desk spots and expiry closes are fixed, so nothing reaches Yahoo or
 * Mongo. Exits non-zero on any failure.
 */
import multiSeed from "../lib/data/multi-products-seed.json";
import targetSeed from "../lib/data/am-targets-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import { BID_ASK_BUCKETS, bidAskSpreadPercent, bidAskTableRows } from "../lib/active-management/bid-ask";
import { activeManagementQuote } from "../lib/active-management/book-row";
import { BOOK_SCENARIO_SHIFTS, bookScenarioRows, productBookInputs } from "../lib/active-management/book-scenario";
import { bookValue, settledOutflowCarryRs } from "../lib/active-management/book-value";
import { irrSet, maxIrr } from "../lib/active-management/irr";
import { expectedDifferenceAtMaturity } from "../lib/active-management/maturity";
import { observationFacts, pendingObservationsText, productHasProgressTab } from "../lib/active-management/observations";
import { productPricerTable } from "../lib/active-management/pricer-table";
import {
  expectedIrrAtLevel,
  inputsAtLevel,
  scenarioGrid,
  scenarioLevels,
  unwindAtLevel,
} from "../lib/active-management/scenario";
import { actualTargetFor } from "../lib/active-management/target-seed";
import { residualTarget, targetCandidates } from "../lib/active-management/targets";
import { blackScholesPrice } from "../lib/engine/black-scholes";
import { collectExpiredLegExpiryDates, legExpiryYmd } from "../lib/engine/expiry-spots";
import { priceLeg, priceProductBook } from "../lib/engine/pricer";
import { bookPremiumFraction } from "../lib/engine/product-premium";
import { computeUnwind, rateZeroCoupon } from "../lib/engine/unwind";
import { normalizeVolSurface, surfaceVolDecimal } from "../lib/engine/vol-surface";
import { postObservationFigures } from "../lib/multi/post-observation";
import { issuedCount, productKey, uniqueProductsByIsin } from "../lib/multi/product-key";
import { observationDatesForProduct, productsWithLiveMaturity, remainingObservationDays } from "../lib/observation-tabs";
import type { ProductMaster, UnderlyingIndex, UnwindInputs, UnwindResult, VolSurface } from "../lib/types";
import { daysBetween, parseISODate, roundDeskMoney, underlyingFromProductName } from "../lib/utils";
import { quoteViewFromUnwind } from "../lib/workbook/product-book-rows";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const AS_OF = "2026-11-09";
const NIFTY = 25_612.35;
const SENSEX = 83_481.9;
const surface = normalizeVolSurface(volSeed as unknown as VolSurface);
const seedBook = uniqueProductsByIsin(multiSeed as unknown as ProductMaster[]);
const book = productsWithLiveMaturity(seedBook, AS_OF);
const byKey = new Map(seedBook.map((p) => [productKey(p), p]));

function named(name: string): ProductMaster {
  const hit = book.find((p) => p.productName.trim() === name);
  if (!hit) throw new Error(`${name} is not a live seed product on ${AS_OF}`);
  return hit;
}

/** Fixed closes per date, varied so a fixing read off the wrong date shows up. */
function fixedClose(day: string, underlying: "Nifty" | "Sensex"): number {
  const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const nifty = 23_000 + ((n * 37) % 2_001);
  return underlying === "Sensex" ? Math.round(nifty * 3.3 * 100) / 100 : nifty;
}

/** Quotes-route conventions: as-of, issued debentures, spread 0, desk spots, the closes the unwind settles with. */
function inputsFor(p: ProductMaster): UnwindInputs {
  const underlying = underlyingFromProductName(p.productName, p.productCode);
  const expirySpots: Record<string, number> = {};
  for (const day of collectExpiredLegExpiryDates(p, AS_OF)) expirySpots[day] = fixedClose(day, underlying);
  return {
    debentures: issuedCount(p),
    unwindDate: AS_OF,
    spot: underlying === "Sensex" ? SENSEX : NIFTY,
    underlying,
    nifty: NIFTY,
    sensex: SENSEX,
    bidAskSpread: 0,
    expirySpots,
  };
}

const priced = new Map<string, { inputs: UnwindInputs; result: UnwindResult }>();
for (const p of book) {
  const inputs = inputsFor(p);
  priced.set(productKey(p), { inputs, result: computeUnwind({ product: p, surface, inputs }) });
}
const pricedOf = (p: ProductMaster) => priced.get(productKey(p))!;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// 1. Observation facts use Unwinding's observation dates and its passed rule (date <= as-of).
{
  let agree = 0;
  let none = 0;
  let some = 0;
  for (const p of book) {
    const f = observationFacts(p, AS_OF, inputsFor(p).expirySpots, AS_OF);
    const passed = f.points.filter((x) => x.passed).map((x) => x.date);
    if (
      sameList(passed, collectExpiredLegExpiryDates(p, AS_OF)) &&
      f.left === remainingObservationDays(p, AS_OF).length &&
      f.nextDate === observationDatesForProduct(p, AS_OF)[0] &&
      f.total === f.passed + f.left &&
      f.missingFixings.length === 0
    ) {
      agree += 1;
    }
    const nonePassed = productHasProgressTab(p, "none-passed", AS_OF);
    const somePassed = productHasProgressTab(p, "some-passed", AS_OF);
    if (nonePassed === somePassed || somePassed !== f.passed > 0) agree -= 1;
    if (nonePassed) none += 1;
    if (somePassed) some += 1;
  }
  check(
    "observation facts agree with collectExpiredLegExpiryDates and remainingObservationDays",
    agree === book.length,
    `${agree} of ${book.length} live products; progress tabs ${none} none passed, ${some} at least one`,
  );
  const expiryDay = observationFacts(named("Nifty Accelerator - 740"), "2026-09-29", {}, "2026-09-29");
  check(
    "an expiry on the as-of day is passed and provisional",
    expiryDay.passed === 2 && expiryDay.points[1]!.passed && expiryDay.points[1]!.provisional,
  );
  const none740 = observationFacts(named("Nifty Accelerator - 740"), AS_OF, {}, AS_OF);
  check(
    "a missing passed close blanks the sum and the average",
    none740.sumFixings == null && none740.averageSoFar == null && sameList(none740.missingFixings, ["2026-06-30", "2026-09-29"]),
  );
}

// 2. Residual Target against Calculator!AS rows, with the workbook's own closes on its 29-Oct-2026 as-of.
{
  check("Residual Target formula", residualTarget(25_000, { total: 4, left: 2, sumFixings: 49_000 }) === 25_500);
  check("Residual Target is the target before any observation", residualTarget(24_920, { total: 3, left: 3, sumFixings: 0 }) === 24_920);
  check("Residual Target is blank with nothing left", residualTarget(25_000, { total: 3, left: 0, sumFixings: 72_000 }) == null);
  check("Residual Target is blank with a fixing missing", residualTarget(25_000, { total: 3, left: 1, sumFixings: null }) == null);
  check("Residual Target is blank with no observations", residualTarget(25_000, { total: 0, left: 0, sumFixings: 0 }) == null);

  // [productKey, Calculator!AR, Calculator!AS (null for "-"), the workbook fixings AG:AL by date]
  const rows: Array<[string, number, number | null, Record<string, number>]> = [
    ["ARG22SP62 - SERIES III", 23940, null, { "2025-12-30": 25938.85, "2026-03-30": 22331.4, "2026-06-30": 23865.75 }],
    ["ARG22SP67 - SERIES I", 22386, null, { "2025-09-30": 24611.1, "2025-12-30": 25938.85, "2026-03-30": 22331.4, "2026-06-30": 23865.75 }],
    ["ARG23SP03L - SERIES III", 22568, 21358.65, { "2026-03-30": 22331.4, "2026-06-30": 23865.75, "2026-09-29": 22716.2 }],
    ["ARG23SP04L - SERIES I", 24206, 26036.05, { "2026-06-30": 23865.75, "2026-09-29": 22716.2 }],
    ["ARG23SP07 - SERIES III", 22211, 20051.05, { "2026-06-30": 23865.75, "2026-09-29": 22716.2 }],
    ["ARG22SP121 - SERIES I", 21546, 16389.75, { "2026-05-26": 23913.7, "2026-08-25": 24334.55 }],
    ["ARG22SP126 - SERIES II", 21700, 13127.1, { "2026-02-24": 25424.65, "2026-05-26": 23913.7, "2026-08-25": 24334.55 }],
    ["ARG23SP35- SERIES II", 23240, 22355.875, { "2026-05-26": 23913.7, "2026-08-25": 24334.55 }],
    ["ARG23SP50 SERIES I", 22820, 22349.025, { "2026-06-30": 23865.75, "2026-09-29": 22716.2 }],
    ["ARG23SP84 SERIES I", 22876, 22389.816667, { "2026-08-25": 24334.55 }],
    ["ARG23SP93 SERIES II", 23541, 23815.933333, { "2026-09-29": 22716.2 }],
  ];
  let match = 0;
  const misses: string[] = [];
  for (const [key, target, expected, fixings] of rows) {
    const p = byKey.get(key);
    const got = p ? residualTarget(target, observationFacts(p, "2026-10-29", fixings, "2099-01-01")) : undefined;
    const ok = expected == null ? got === null : got != null && Math.abs(got - expected) < 1e-5;
    if (ok) match += 1;
    else misses.push(`${key} ${got} vs ${expected}`);
  }
  check("Residual Target equals the Calculator rows", match === rows.length, `${match} of ${rows.length} ${misses.join("; ")}`);
  // The workbook's close history stops on 29-Sep-2026, so it counts 27-Oct as pending (26,778.95).
  // Here a passed date without a close stays blank until the close arrives.
  const f715 = observationFacts(named("Nifty Accelerator - 715"), "2026-10-29", { "2026-04-28": 23995.7, "2026-07-28": 23985.35 }, "2099-01-01");
  check(
    "715 stays blank while its 30-Apr and 27-Oct closes are missing",
    residualTarget(24_920, f715) == null && sameList(f715.missingFixings, ["2026-04-30", "2026-10-27"]),
  );
}

// 3. Max IRR is Unwinding's Product IRR exactly; blank only for coupon or tenor 0.
{
  let equal = 0;
  let blank = 0;
  let wrong = 0;
  for (const p of book) {
    const cap = maxIrr(p);
    if (cap == null) {
      if (p.coupon > 0 && p.tenorDays > 0) wrong += 1;
      else blank += 1;
    } else if (cap === pricedOf(p).result.productIRR) equal += 1;
    else wrong += 1;
  }
  check("Max IRR equals productIRR exactly", wrong === 0, `${equal} equal, ${blank} blank for coupon or tenor 0`);
}

// 4. The ladder centre is the on-screen unwind.
const sample = [
  named("Nifty Accelerator - 961"),
  named("Nifty Accelerator - 1624"),
  named("Nifty Accelerator - 740"),
  named("Gearing Sensex Accelerator - 22"),
  ...book.filter((_, i) => i % 200 === 0),
];
{
  let centred = 0;
  for (const p of sample) {
    const { inputs, result } = pricedOf(p);
    const g = scenarioGrid({ product: p, surface, inputs });
    const levels = scenarioLevels(g.baseSpot);
    if (
      g.cells.length === 21 &&
      g.cells.every((c, i) => c.level === levels[i]) &&
      g.base.k === 0 &&
      g.base.unwindQuoteRs === result.unwindQuoteRs &&
      g.base.premiumOutflowRs === result.masterEconomics.premiumOutflowRs &&
      g.base.irr.clientIRR === result.clientIRR
    ) {
      centred += 1;
    }
  }
  check("ladder k = 0 equals computeUnwind", centred === sample.length, `${centred} of ${sample.length}`);
}

// 5. Expired legs keep their settled cash at every level.
{
  const mixed = book
    .filter((p) => {
      const rows = pricedOf(p).result.optionRows;
      return rows.some((r) => r.expired) && rows.some((r) => !r.expired);
    })
    .slice(0, 25);
  let kept = 0;
  for (const p of mixed) {
    const { inputs, result } = pricedOf(p);
    const spot = inputs.underlying === "Sensex" ? SENSEX : NIFTY;
    const shifted = [-1000, 1000].map((d) => unwindAtLevel({ product: p, surface, base: inputs, level: spot + d }));
    const same = shifted.every((r) =>
      r.optionRows.every((row, i) => !row.expired || (row.premiumOutflowRs === result.optionRows[i]!.premiumOutflowRs && row.unwindPrice === result.optionRows[i]!.unwindPrice)),
    );
    if (same) kept += 1;
  }
  check("expired-leg cash is unchanged across levels", mixed.length > 0 && kept === mixed.length, `${kept} of ${mixed.length} mixed products`);
}

// 6. A Sensex shift moves the engine spot (deskPricingSpot prefers inputs.sensex over inputs.spot).
{
  const p = named("Gearing Sensex Accelerator - 22");
  const { inputs } = pricedOf(p);
  const level = SENSEX + 1000;
  const moved = unwindAtLevel({ product: p, surface, base: inputs, level });
  const spotOnly = computeUnwind({ product: p, surface, inputs: { ...inputs, spot: level } });
  check("Sensex shift moves the engine spot", moved.spot === level, `${moved.spot}`);
  check("shifting inputs.spot alone is ignored on a Sensex product", spotOnly.spot === SENSEX, `${spotOnly.spot}`);
  check("Sensex shift leaves the Nifty level alone", inputsAtLevel(p, inputs, level).nifty === NIFTY);
}

// 7. Without the closes map the scenario refuses to settle expired legs at the scenario spot.
{
  const p = named("Nifty Accelerator - 671");
  const { inputs } = pricedOf(p);
  let threwNoMap = false;
  try {
    inputsAtLevel(p, { ...inputs, expirySpots: undefined }, NIFTY);
  } catch {
    threwNoMap = true;
  }
  let threwEmpty = "";
  try {
    computeUnwind({ product: p, surface, inputs: { ...inputs, expirySpots: {} } });
  } catch (err) {
    threwEmpty = err instanceof Error ? err.message : String(err);
  }
  check("a missing expirySpots map throws", threwNoMap);
  check("a close missing from the map throws", /expiry spot missing/i.test(threwEmpty), threwEmpty);
}

// 8. Pricer rows and Options Book rows align by index.
{
  const products = book.filter((_, i) => i % 7 === 0);
  let aligned = 0;
  let rowsChecked = 0;
  for (const p of products) {
    const { inputs, result } = pricedOf(p);
    const table = productPricerTable({ product: p, surface, inputs, result });
    const ok =
      table.length === result.optionRows.length &&
      table.every((row, i) => {
        const book = result.optionRows[i]!;
        const fixing = book.expired ? inputs.expirySpots![legExpiryYmd(book.expiry)] : null;
        return row.strike === book.strike && legExpiryYmd(row.maturity) === legExpiryYmd(book.expiry) && row.expired === book.expired && row.settlementFixing === fixing;
      });
    if (ok) aligned += 1;
    rowsChecked += table.length;
  }
  check("Pricer rows align with optionRows", aligned === products.length, `${aligned} of ${products.length} products, ${rowsChecked} rows`);
}

// 9. Every leg expired: the ladder is flat by construction.
{
  const done = book.filter((p) => pricedOf(p).result.optionRows.every((r) => r.expired));
  let flat = 0;
  for (const p of done) {
    const { inputs, result } = pricedOf(p);
    const g = scenarioGrid({ product: p, surface, inputs, baseResult: result });
    if (g.flat && g.cells.every((c) => c.unwindQuoteRs === result.unwindQuoteRs && c.change.unwindQuoteRs === 0 && c.change.premiumOutflowRs === 0)) flat += 1;
  }
  check("flat ladder for products with every leg expired", done.length > 0 && flat === done.length, `${flat} of ${done.length}`);
}

// Actual Target seed: New Primary Target Nifty, else the top original-Sell Put strike.
{
  const seeded = targetSeed as Record<string, { target: number; isin: string }>;
  const entries = Object.values(seeded);
  check("target seed is baked", entries.length >= 2_000 && entries.every((e) => e.target > 0), `${entries.length} targets`);
  const t715 = actualTargetFor(named("Nifty Accelerator - 715"));
  check("715 Actual Target is 24,920 from the Product Master", t715.target === 24_920 && t715.source === "Product Master", JSON.stringify(t715));
  const p740 = named("Nifty Accelerator - 740");
  const t740 = actualTargetFor(p740);
  check(
    "740 Actual Target is the manual 22,211, not the 23,541 strike",
    t740.target === 22_211 && t740.source === "Product Master" && targetCandidates(p740).topSellPutStrike === 23_541,
    JSON.stringify(t740),
  );
  const t671 = actualTargetFor(named("Nifty Accelerator - 671"));
  check("an unmatched series falls back to the top Sell Put strike", t671.source === "Top Sell Put Strike" && t671.target === targetCandidates(named("Nifty Accelerator - 671")).topSellPutStrike);
  let fromMaster = 0;
  for (const p of book) if (actualTargetFor(p).source === "Product Master") fromMaster += 1;
  console.log(`  live Actual Targets from the Product Master: ${fromMaster} of ${book.length}`);

  // Calculator!AR (Primary "Target Nifty") on every workbook product found in the multi seed.
  const workbook: Record<string, number> = {
    "ARG20SP140 - SERIES II": 23187.06, "ARG20SP140 - SERIES V": 23187.06, "ARG20SP143 - SERIES II": 23266.8,
    "ARG20SP150 - SERIES II": 23296.5, "ARG20SP152 - SERIES I": 23653.74, "ARG20SP152 - SERIES II": 23653.74,
    "ARG20SP153 - SERIES IX": 23699.1, "ARG20SP153 - SERIES V": 23699.1, "ARG20SP154 - SERIES X": 23799.78,
    "ARG20SP154 - SERIES XIII": 23799.78, "ARG20SP16 - SERIES III": 22341.66, "ARG21DMFSP41-SERIES 1": 25419,
    "ARG21SP39 - SERIES V": 24087, "ARG21SP39 - SERIES VI": 24087, "ARG21SP42 - SERIES VI": 24420,
    "ARG21SP83 - SERIES I": 25308, "ARG21SP86 - SERIES V": 25308, "ARG21SP88 - SERIES VI": 24864,
    "ARG21SP90 - SERIES VI": 25197, "ARG22DMFSP07-SERIES 1": 24339, "ARG22SP100 - SERIES I": 24339,
    "ARG22SP100 - SERIES II": 22509, "ARG22SP101 - SERIES I": 24339, "ARG22SP102 - SERIES I": 24006.5,
    "ARG22SP103 - SERIES I": 23275, "ARG22SP104 - SERIES III": 23275, "ARG22SP105 - SERIES I": 23275,
    "ARG22SP106 - SERIES I": 23009, "ARG22SP107 - SERIES I": 23275, "ARG22SP108 - SERIES I": 23674,
    "ARG22SP109 - SERIES I": 24920, "ARG22SP110 - SERIES I": 23275, "ARG22SP110 - SERIES II": 21700,
    "ARG22SP111 - SERIES I": 23408, "ARG22SP111 - SERIES II": 21824, "ARG22SP112 - SERIES I": 23408,
    "ARG22SP113 - SERIES I": 22610, "ARG22SP114 - SERIES I": 23009, "ARG22SP114 - SERIES II": 21452,
    "ARG22SP115 - SERIES I": 23009, "ARG22SP116 - SERIES I": 21812, "ARG22SP117 - SERIES I": 21812,
    "ARG22SP118 - SERIES I": 22610, "ARG22SP118 - SERIES II": 21080, "ARG22SP119 - SERIES I": 22610,
    "ARG22SP120 - SERIES I": 22344, "ARG22SP120 - SERIES III": 22477, "ARG22SP121 - SERIES I": 21546,
    "ARG22SP123 - SERIES I": 22477, "ARG22SP125 - SERIES I": 23275, "ARG22SP126 - SERIES I": 23275,
    "ARG22SP126 - SERIES II": 21700, "ARG22SP127 - SERIES I": 23275, "ARG22SP127 - SERIES II": 21700,
    "ARG22SP38 - SERIES I": 23275, "ARG22SP45 - SERIES I": 21546, "ARG22SP57 - SERIES I": 23275,
    "ARG22SP62 - SERIES III": 23940, "ARG22SP62 - SERIES IV": 23541, "ARG22SP63 - SERIES I": 23940,
    "ARG22SP65 - SERIES I": 23142, "ARG22SP66 - SERIES II": 24206, "ARG22SP66 - SERIES III": 23674,
    "ARG22SP67 - SERIES I": 22386, "ARG22SP68 - SERIES I": 24206, "ARG22SP68 - SERIES II": 22386,
    "ARG22SP69 - SERIES I": 22386, "ARG22SP70 - SERIES III": 22878, "ARG22SP70 - SERIES IV": 22386,
    "ARG22SP70 - SERIES V": 24738, "ARG22SP70 - SERIES VI": 24738, "ARG22SP70 - SERIES VII": 23807,
    "ARG22SP71 - SERIES I": 24738, "ARG22SP71 - SERIES II": 22878, "ARG22SP73 - SERIES I": 21812,
    "ARG22SP74 - SERIES I": 24472, "ARG22SP74 - SERIES II": 24472, "ARG22SP74 - SERIES III": 24339,
    "ARG22SP74 - SERIES IV": 24605, "ARG22SP74 - SERIES V": 24605, "ARG22SP75 - SERIES I": 22755,
    "ARG22SP76 - SERIES I": 23807, "ARG22SP76 - SERIES II": 23807, "ARG22SP76 - SERIES III": 23541,
    "ARG22SP77 - SERIES I": 24605, "ARG22SP77 - SERIES II": 22755, "ARG22SP77 - SERIES III": 23807,
    "ARG22SP77 - SERIES IV": 23807, "ARG22SP78 - SERIES I": 24073, "ARG22SP79 - SERIES II": 24206,
    "ARG22SP79 - SERIES IV": 24206, "ARG22SP81 - SERIES I": 24206, "ARG22SP98 - SERIES I": 23940,
    "ARG22SP99 - SERIES I": 24339, "ARG22SP99 - SERIES II": 22509, "ARG23SP02L - SERIES I": 23275,
    "ARG23SP03L - SERIES I": 23275, "ARG23SP03L - SERIES II": 21700, "ARG23SP03L - SERIES III": 22568,
    "ARG23SP04L - SERIES I": 24206, "ARG23SP05 - SERIES I": 24206, "ARG23SP05 - SERIES II": 22568,
    "ARG23SP06 - SERIES I": 23275, "ARG23SP06 - SERIES II": 23142, "ARG23SP07 - SERIES I": 23541,
    "ARG23SP07 - SERIES II": 21948, "ARG23SP07 - SERIES III": 22211, "ARG23SP08 - SERIES I": 24206,
    "ARG23SP09L - SERIES I": 23541, "ARG23SP102 SERIES I": 23275, "ARG23SP11 - SERIES I": 22876,
    "ARG23SP11 - SERIES II": 22876, "ARG23SP11 - SERIES III": 21945, "ARG23SP11 - SERIES IV": 21328,
    "ARG23SP12L - SERIES I": 24206, "ARG23SP12L - SERIES II": 22568, "ARG23SP13L - SERIES I": 23392,
    "ARG23SP14L - SERIES I": 23541, "ARG23SP14L - SERIES II": 21948, "ARG23SP15L - SERIES I": 22876,
    "ARG23SP16 - SERIES I": 23142, "ARG23SP16 - SERIES II": 22078, "ARG23SP16 - SERIES III": 21576,
    "ARG23SP17 - SERIES II": 23664, "ARG23SP18 - SERIES I": 23528, "ARG23SP18 - SERIES II": 23009,
    "ARG23SP18 - SERIES III": 21452, "ARG23SP19 - SERIES I": 22344, "ARG23SP20 - SERIES I": 21945,
    "ARG23SP21 - SERIES II": 22477, "ARG23SP22L - SERIES I": 23009, "ARG23SP23 - SERIES I": 23009,
    "ARG23SP34- SERIES I": 22848, "ARG23SP35- SERIES II": 23240, "ARG23SP37- SERIES I": 23380,
    "ARG23SP42 SERIES IV": 23100, "ARG23SP50 SERIES I": 22820, "ARG23SP50 SERIES II": 22168,
    "ARG23SP50 SERIES III": 21679, "ARG23SP51 SERIES II": 22440, "ARG23SP52 SERIES I": 22712,
    "ARG23SP52 SERIES II": 22211, "ARG23SP54 SERIES I": 23664, "ARG23SP54 SERIES II": 23142,
    "ARG23SP54 SERIES III": 23142, "ARG23SP66 SERIES I": 23940, "ARG23SP77 SERIES I": 22590,
    "ARG23SP84 SERIES I": 22876, "ARG23SP93 SERIES II": 23541, "ARG23SP97 SERIES I": 23408
  };
  let agree = 0;
  const misses: string[] = [];
  for (const [key, target] of Object.entries(workbook)) {
    const p = byKey.get(key);
    const got = p ? actualTargetFor(p).target : null;
    if (got != null && Math.abs(got - target) < 1e-6) agree += 1;
    else misses.push(`${key} ${got} vs ${target}`);
  }
  const total = Object.keys(workbook).length;
  check(
    "Actual Target equals the workbook Calculator!AR",
    agree === total,
    `${agree} of ${total} (${((agree / total) * 100).toFixed(1)}%) ${misses.join("; ")}`,
  );
}

// Product Book composer.
{
  const am = (p: ProductMaster, expected: ReturnType<typeof expectedIrrAtLevel> | null, fixings?: Record<string, number>, today = AS_OF) => {
    const { inputs, result } = pricedOf(p);
    return activeManagementQuote({ product: p, asOf: AS_OF, result, surface, fixings: fixings ?? inputs.expirySpots, target: actualTargetFor(p), expected, today });
  };
  const atLevel = (p: ProductMaster, level: number) => expectedIrrAtLevel({ product: p, surface, inputs: pricedOf(p).inputs, level });
  const deskSpot = (p: ProductMaster) => (pricedOf(p).inputs.underlying === "Sensex" ? SENSEX : NIFTY);

  let equal = 0;
  let sane = 0;
  for (const p of book) {
    const copied = am(p, null);
    const repriced = am(p, atLevel(p, deskSpot(p)));
    if (
      repriced.expectedIrr === copied.expectedIrr &&
      copied.expectedIrr === copied.currentIrr &&
      repriced.expectedQuoteRs === copied.expectedQuoteRs &&
      repriced.assumedLevel === copied.assumedLevel &&
      copied.assumedLevel === deskSpot(p)
    ) {
      equal += 1;
    }
    if (
      copied.observationsPassed + copied.observationsLeft === copied.observationsTotal &&
      (copied.maxIrr == null || copied.currentIrr == null || copied.currentIrr <= copied.maxIrr) &&
      (copied.observationsLeft > 0 || copied.effectiveTarget == null) &&
      // Before the first observation (T × N) ÷ N is the target to the last float bit.
      (copied.observationsPassed > 0 ||
        (copied.actualTarget != null && Math.abs(copied.effectiveTarget! - copied.actualTarget) <= 1e-9 * copied.actualTarget))
    ) {
      sane += 1;
    }
  }
  check("Expected IRR equals Current IRR when the assumed level is the desk spot", equal === book.length, `${equal} of ${book.length}`);
  check("composer fields hold together on every live product", sane === book.length, `${sane} of ${book.length}`);

  // 735 sits below its Max IRR at these spots, so the capped Expected IRR moves both ways.
  const p735 = named("Nifty Accelerator - 735");
  const base735 = am(p735, null);
  const up735 = am(p735, atLevel(p735, NIFTY + 1000));
  const down735 = am(p735, atLevel(p735, NIFTY - 1000));
  check(
    "Nifty +1,000 raises Expected IRR, −1,000 lowers it",
    base735.currentIrr != null &&
      down735.expectedIrr! < base735.currentIrr &&
      base735.currentIrr < up735.expectedIrr! &&
      up735.expectedIrr! < base735.maxIrr!,
    `${down735.expectedIrr} < ${base735.currentIrr} < ${up735.expectedIrr} < Max ${base735.maxIrr}`,
  );

  const p740 = named("Nifty Accelerator - 740");
  const base740 = am(p740, null);

  const sx = named("Sensex Accelerator - 4");
  const upSx = atLevel(sx, SENSEX + 3000);
  const amSx = am(sx, upSx);
  check(
    "Sensex +3,000 reprices at that Sensex level and raises the quote",
    amSx.assumedLevel === SENSEX + 3000 &&
      upSx.unwindQuoteRs > pricedOf(sx).result.unwindQuoteRs &&
      upSx.irr.clientIRR > pricedOf(sx).result.clientIRR &&
      unwindAtLevel({ product: sx, surface, base: pricedOf(sx).inputs, level: SENSEX + 3000 }).spot === SENSEX + 3000,
    `${pricedOf(sx).result.unwindQuoteRs.toFixed(2)} → ${upSx.unwindQuoteRs.toFixed(2)}`,
  );

  const has = (warnings: string[], text: string) => warnings.includes(text);
  check("fallback target is flagged", has(am(named("Nifty Accelerator - 671"), null).warnings, "Actual Target From Top Sell Put Strike"));
  const p829 = named("Nifty Magnifier - 829");
  const noCap = am(p829, null);
  check(
    "coupon 0 leaves Max IRR blank and Current IRR uncapped",
    noCap.maxIrr == null && noCap.currentIrr === irrSet(pricedOf(p829).result, p829).bookIRR && has(noCap.warnings, "No Max IRR Cap Because Coupon Or Tenor Is Zero"),
  );
  const fixings740 = { ...pricedOf(p740).inputs.expirySpots! };
  delete fixings740["2026-06-30"];
  const missing = am(p740, null, fixings740);
  check(
    "a missing close is flagged and blanks Effective Target",
    has(missing.warnings, "Missing Fixing On 30-Jun-2026") && missing.effectiveTarget == null && missing.averageSoFar == null,
    missing.warnings.join(", "),
  );
  check("a close fixed today is flagged provisional", has(am(p740, null, undefined, "2026-09-29").warnings, "Provisional Fixing On 29-Sep-2026"));
  check(
    "Effective Target is (Target × Total − Σ closes) ÷ Left",
    base740.effectiveTarget === (22_211 * 3 - fixedClose("2026-06-30", "Nifty") - fixedClose("2026-09-29", "Nifty")) / 1,
    String(base740.effectiveTarget),
  );
  // A put spread's loss is bounded, so take a Maximizer: its quote goes negative at Nifty 1,000.
  const p18 = named("Nifty Maximizer - 18");
  const crash = atLevel(p18, 1000);
  const crashed = am(p18, crash);
  const crashBook = bookValue(p18, unwindAtLevel({ product: p18, surface, base: pricedOf(p18).inputs, level: 1000 })).bookQuoteRs;
  check(
    "a non-positive book quote at the assumed level blanks Expected IRR",
    crashBook <= 0 && crash.irr.flags.nonPositiveQuote && crashed.expectedIrr == null && has(crashed.warnings, "Expected IRR Blank Because Book Unwind Quote Is Not Positive"),
    crashBook.toFixed(2),
  );
  const guarded = activeManagementQuote({
    product: p740,
    asOf: AS_OF,
    result: { ...pricedOf(p740).result, investedTenorDays: 0, clientIRR: 0 },
    surface,
    fixings: pricedOf(p740).inputs.expirySpots,
    target: actualTargetFor(p740),
    expected: null,
    today: AS_OF,
  });
  check(
    "invested tenor 0 blanks Current and Expected IRR",
    guarded.currentIrr == null && guarded.expectedIrr == null && has(guarded.warnings, "Current And Expected IRR Blank Because Invested Tenor Is Zero"),
  );
}

// Bid Ask table: the workbook's Bid Ask sheet by financial year.
{
  // Bid Ask!A2:B60, grouped by spread. Every sheet row gets its own spread back.
  const sheet: Array<[number, string[]]> = [
    [0.75, ["2026-01-27", "2026-02-24", "2026-03-30", "2026-04-28", "2026-05-26", "2026-06-30", "2026-07-28", "2026-08-25",
      "2026-09-29", "2026-10-27", "2026-11-24", "2026-12-29", "2027-01-25", "2027-02-23", "2027-03-30"]],
    [0.5, ["2027-04-27", "2027-05-25", "2027-06-29", "2027-07-27", "2027-08-31", "2027-09-28", "2027-10-26", "2027-11-30",
      "2027-12-28", "2028-01-25", "2028-02-29", "2028-03-28"]],
    [0.375, ["2028-04-25", "2028-05-30", "2028-06-27", "2028-07-25", "2028-08-29", "2028-09-26", "2028-10-31", "2028-11-28",
      "2028-12-26", "2029-01-30", "2029-02-27", "2029-03-27"]],
    [0.25, ["2029-04-24", "2029-05-29", "2029-06-26", "2029-07-31", "2029-08-28", "2029-09-25", "2029-10-30", "2029-11-27",
      "2029-12-24", "2030-01-29", "2030-02-26", "2030-03-28"]],
    [0.075, ["2030-04-25", "2030-05-30", "2030-06-27", "2030-07-25", "2030-08-29", "2030-09-26", "2030-10-31", "2030-11-28"]],
  ];
  const sheetRows = sheet.flatMap(([s, days]) => days.map((day) => [day, s] as const));
  const sheetMisses = sheetRows.filter(([day, s]) => bidAskSpreadPercent(day) !== s).map(([day]) => day);
  check(
    "Bid Ask buckets give every workbook sheet row its spread",
    sheetRows.length === 59 && sheetMisses.length === 0,
    `${sheetRows.length - sheetMisses.length} of ${sheetRows.length} ${sheetMisses.join(", ")}`,
  );
  const edges: Array<[string, number]> = [
    ["2027-03-31", 0.75], ["2027-04-01", 0.5], ["2028-03-31", 0.5], ["2028-04-01", 0.375], ["2029-03-31", 0.375],
    ["2029-04-01", 0.25], ["2030-03-31", 0.25], ["2030-04-01", 0.075], ["2031-03-26", 0.075],
    // Not on the sheet, so the workbook prices it at vol 0 (bug B10); here it falls in its bucket.
    ["2027-07-29", 0.5],
    ["2027-03-30T00:00:00.000Z", 0.75],
  ];
  const edgeMisses = edges.filter(([day, s]) => bidAskSpreadPercent(day) !== s).map(([day]) => day);
  check("Bid Ask buckets run through 31 March, and an expiry off the sheet still gets a spread", edgeMisses.length === 0, edgeMisses.join(", "));
  check(
    "Bid Ask buckets are 0.75, 0.5, 0.375, 0.25, then 0.075",
    BID_ASK_BUCKETS.map((b) => `${b.through ?? "after"}:${b.spreadPercent}`).join(" ") ===
      "2027-03-31:0.75 2028-03-31:0.5 2029-03-31:0.375 2030-03-31:0.25 after:0.075",
  );
  const table = bidAskTableRows(surface);
  check(
    "Bid Ask table rows: one per surface expiry",
    table.length === surface.expiries.length &&
      table.every((row, i) => row.expiry === surface.expiries[i]!.slice(0, 10) && row.spreadPercent === bidAskSpreadPercent(row.expiry)),
    table.map((row) => `${row.expiry} ${row.spreadPercent}`).join(", "),
  );

  // Live legs: the table against an explicit 0, and a flat spread against the old formula rebuilt from its parts.
  const products = book.filter((_, i) => i % 25 === 0);
  let legs = 0;
  let ordered = 0;
  let strictLegs = 0;
  let strict = 0;
  let tableZ = 0;
  let zeroFlat = 0;
  let rebuilt = 0;
  let rebuiltLegs = 0;
  const valuationDate = parseISODate(AS_OF);
  for (const [n, p] of products.entries()) {
    const underlying = underlyingFromProductName(p.productName, p.productCode);
    const spot = underlying === "Sensex" ? SENSEX : NIFTY;
    const withTable = priceProductBook({ product: p, spot, valuationDate: AS_OF, surface, underlying });
    const withZero = priceProductBook({ product: p, spot, valuationDate: AS_OF, surface, underlying, bidAskSpread: 0 });
    withTable.forEach((row, i) => {
      if (row.expired) return;
      const zero = withZero[i]!;
      legs += 1;
      if (row.sellPrice <= row.price && row.price <= row.buyPrice) ordered += 1;
      if (row.price >= 1) {
        strictLegs += 1;
        if (row.sellPrice < row.price && row.price < row.buyPrice) strict += 1;
      }
      if (row.bidOffer === (2 * bidAskSpreadPercent(row.maturity)) / 100) tableZ += 1;
      if (
        zero.bidOffer === 0 &&
        zero.sellPrice === zero.price &&
        zero.buyPrice === zero.price &&
        zero.price === row.price &&
        zero.volatility === row.volatility
      ) {
        zeroFlat += 1;
      }
    });
    // A flat number is priced exactly as before: σ ∓ z ÷ 2 into Black–Scholes, rounded to the paisa.
    if (n % 6 !== 0) continue;
    for (const leg of p.legs) {
      if (leg.reqQuantity == null || !Number.isFinite(leg.reqQuantity) || leg.reqQuantity === 0) continue;
      const maturity = parseISODate(leg.expiry);
      const tauYears = daysBetween(valuationDate, maturity) / 365;
      if (tauYears <= 0) continue;
      const { vol, fwd } = surfaceVolDecimal(surface, leg.strike, maturity, spot, underlying);
      const isCall = /^c/i.test(String(leg.optionType));
      const base = { spot, strike: leg.strike, tauYears, forwardGrowth: fwd, discountYield: fwd + 0.01, vol, isCall };
      for (const z of [0, 0.02]) {
        rebuiltLegs += 1;
        const got = priceLeg({ leg, spot, valuationDate, surface, bidAskSpread: z, underlying });
        if (
          got.price === roundDeskMoney(blackScholesPrice(base)) &&
          got.sellPrice === roundDeskMoney(blackScholesPrice({ ...base, vol: Math.max(vol - z / 2, 1e-8) })) &&
          got.buyPrice === roundDeskMoney(blackScholesPrice({ ...base, vol: vol + z / 2 })) &&
          got.bidOffer === z
        ) {
          rebuilt += 1;
        }
      }
    }
  }
  check(
    "Bid Ask table: Sell ≤ Mid ≤ Buy on every live leg, and Sell < Mid < Buy once the mid is ₹1 or more",
    legs > 0 && ordered === legs && strictLegs > 0 && strict === strictLegs,
    `${ordered} of ${legs} ordered, ${strict} of ${strictLegs} strict, ${products.length} products`,
  );
  check("Bid Ask table: each live leg's Bid Offer is 2 × s(expiry) ÷ 100", tableZ === legs, `${tableZ} of ${legs}`);
  check("explicit 0: Sell = Mid = Buy with Bid Offer 0, and the same mid and vol as the table", zeroFlat === legs, `${zeroFlat} of ${legs}`);
  check("a flat spread (0 or 0.02) prices exactly as the old formula", rebuiltLegs > 0 && rebuilt === rebuiltLegs, `${rebuilt} of ${rebuiltLegs}`);

  // The unwind: the headline quote is mid-based, so only the book's option cash takes the spread.
  let same = 0;
  let adverse = 0;
  let marks = 0;
  for (const p of products) {
    const inputs = { ...productBookInputs(p, { unwindDate: AS_OF, nifty: NIFTY, sensex: SENSEX }), expirySpots: inputsFor(p).expirySpots };
    const t = computeUnwind({ product: p, surface, inputs });
    const z = computeUnwind({ product: p, surface, inputs: { ...inputs, bidAskSpread: 0 } });
    if (t.unwindQuoteRs === z.unwindQuoteRs && t.clientIRR === z.clientIRR && t.bidAskSpread === null && z.bidAskSpread === 0) same += 1;
    if (t.masterEconomics.premiumOutflowRs <= z.masterEconomics.premiumOutflowRs) adverse += 1;
    const pricer = priceProductBook({ product: p, spot: t.spot, valuationDate: AS_OF, surface, underlying: inputs.underlying as UnderlyingIndex });
    const sideMark = (i: number, original: string) => (/^s/i.test(original) ? pricer[i]!.buyPrice : pricer[i]!.sellPrice);
    if (t.optionRows.every((row, i) => row.expired || Math.abs(row.unwindPrice) === sideMark(i, row.original))) marks += 1;
  }
  check("Bid Ask table leaves the headline quote and Client IRR as they are", same === products.length, `${same} of ${products.length}`);
  check("Bid Ask table only ever lowers Premium Outflow", adverse === products.length, `${adverse} of ${products.length}`);
  check("Options Book marks are the table Buy (original Sell) and Sell (original Buy) prices", marks === products.length, `${marks} of ${products.length}`);
  check(
    "the Product Book basis has no flat spread",
    !("bidAskSpread" in productBookInputs(book[0]!, { unwindDate: AS_OF, nifty: NIFTY, sensex: SENSEX })),
  );
}

// Exit Value, the AZ carry and Current IRR on the book quote (workbook K, L, U, BH, Summary G).
/** The Product Book basis (quotes route): table spread, issued debentures, desk spots, closes from `closes`. */
function quoteBasis(p: ProductMaster, closes: (day: string) => number): UnwindInputs {
  const expirySpots: Record<string, number> = {};
  for (const day of collectExpiredLegExpiryDates(p, AS_OF)) expirySpots[day] = closes(day);
  return { ...productBookInputs(p, { unwindDate: AS_OF, nifty: NIFTY, sensex: SENSEX }), expirySpots };
}
{
  let carried = 0;
  let withCarry = 0;
  let rates = 0;
  const valuation = parseISODate(AS_OF);
  for (const p of book) {
    const { result } = pricedOf(p);
    let manual = 0;
    for (const row of result.optionRows) {
      if (row.expired) manual += (row.premiumOutflowRs * p.premDiscRate * daysBetween(parseISODate(row.expiry), valuation)) / 365;
    }
    const value = bookValue(p, result);
    if (
      value.settledCarryRs === roundDeskMoney(manual) &&
      value.exitValueRs === roundDeskMoney(result.masterEconomics.unwindValueRs + value.settledCarryRs) &&
      value.bookQuoteRs === roundDeskMoney(value.exitValueRs / result.totalDebs)
    ) {
      carried += 1;
    }
    if (value.settledCarryRs !== 0) withCarry += 1;
    const irr = irrSet(result, p);
    const bookIrr = rateZeroCoupon(result.investedTenorDays / 365, p.faceValue, value.bookQuoteRs);
    const cap = maxIrr(p);
    const want = result.investedTenorDays > 0 && value.bookQuoteRs > 0 ? (cap == null ? bookIrr : Math.min(bookIrr, cap)) : null;
    if (irr.bookIRR === bookIrr && irr.currentIrr === want) rates += 1;
  }
  check(
    "Exit Value is Unwind Value plus Σ settled cash × Premium Discounting Rate × days since expiry ÷ 365",
    carried === book.length && withCarry > 0,
    `${carried} of ${book.length}; ${withCarry} carry settled cash`,
  );
  check("Current IRR is min(the zero-coupon rate on Exit Value ÷ debentures, Max IRR)", rates === book.length, `${rates} of ${book.length}`);
  const p961 = named("Nifty Accelerator - 961");
  check("no settled leg, no carry", settledOutflowCarryRs(p961, pricedOf(p961).result) === 0);
}

// Headline quote: Number of Spreads is a size, so its sign never flips a premium cell.
{
  const p961 = named("Nifty Accelerator - 961");
  const flipped: ProductMaster = {
    ...p961,
    legs: p961.legs.map((leg) => (/^s/i.test(String(leg.originalSide)) ? { ...leg, spreads: -leg.spreads } : leg)),
  };
  const inputs = pricedOf(p961).inputs;
  const a = computeUnwind({ product: p961, surface, inputs });
  const b = computeUnwind({ product: flipped, surface, inputs });
  check(
    "sold legs stored with negative spreads give the same headline quote",
    p961.legs.every((leg) => leg.spreads >= 0) &&
      a.unwindQuoteRs === b.unwindQuoteRs &&
      a.clientIRR === b.clientIRR &&
      a.masterEconomics.unwindValueRs === b.masterEconomics.unwindValueRs,
    `${a.unwindQuoteRs.toFixed(2)} and ${b.unwindQuoteRs.toFixed(2)}`,
  );
  let negative = 0;
  let close = 0;
  for (const p of book) {
    if (!p.legs.some((leg) => leg.spreads < 0)) continue;
    negative += 1;
    const r = pricedOf(p).result;
    if (Math.abs(r.unwindQuoteRs - r.masterEconomics.unwindQuoteRs) <= 100) close += 1;
  }
  console.log(`  live products with negative spreads: ${negative}; headline within ₹100 of the book quote at no spread: ${close}`);
}

// Expected Difference at Maturity (maturity.ts): mid marks, carried to maturity.
{
  const sampleEd = [
    named("Nifty Accelerator - 664"),
    named("Nifty Accelerator - 735"),
    named("Nifty Accelerator - 961"),
    named("Gearing Sensex Accelerator - 22"),
  ];
  let identity = 0;
  let spreadFree = 0;
  const lines: string[] = [];
  const g = (rate: number, days: number) => Math.pow(1 + rate, days / 365);
  const valuation = parseISODate(AS_OF);
  for (const p of sampleEd) {
    const underlying = underlyingFromProductName(p.productName, p.productCode);
    const inputs = quoteBasis(p, (day) => fixedClose(day, underlying));
    const withTable = computeUnwind({ product: p, surface, inputs });
    const atZero = computeUnwind({ product: p, surface, inputs: { ...inputs, bidAskSpread: 0 } });
    const got = expectedDifferenceAtMaturity(p, withTable, surface)!;
    if (got === expectedDifferenceAtMaturity(p, atZero, surface)) spreadFree += 1;
    // Rebuilt from the product fields and the z = 0 Options Book cash.
    const full = atZero.investedTenorDays + atZero.residualTenor;
    const maturity = new Date(valuation.getTime() + atZero.residualTenor * 86_400_000);
    const amountWithNbfc = p.mobilization * (1 - p.inbuilt - p.tranCost - p.issuanceCost - p.marginCost) - p.totalFundsForMargin;
    let atMaturity =
      amountWithNbfc * g(p.prdDiscRate, full) +
      p.totalFundsForMargin * g(p.marginFundingRate, full) +
      bookPremiumFraction(p) * p.mobilization * g(p.premDiscRate, full);
    for (const row of atZero.optionRows) {
      const expiry = parseISODate(row.expiry);
      const carry = g(p.premDiscRate, daysBetween(expiry, maturity));
      if (row.expired) {
        atMaturity += row.premiumOutflowRs * carry;
      } else {
        const { fwd } = surfaceVolDecimal(surface, row.strike, expiry, atZero.spot, underlying);
        atMaturity += row.premiumOutflowRs * Math.exp((fwd + 0.01) * (daysBetween(valuation, expiry) / 365)) * carry;
      }
    }
    const want = atMaturity - postObservationFigures(p, null).expectedAmount;
    if (Math.abs(got - want) < 0.05) identity += 1;
    lines.push(`${p.productName.trim()} ${got.toFixed(2)}`);
  }
  check("Expected Difference is the book and option cash carried to maturity less Expected Amount", identity === sampleEd.length, lines.join("; "));
  check("Expected Difference reads mid marks: the same with the table spread and with 0", spreadFree === sampleEd.length, `${spreadFree} of ${sampleEd.length}`);
  check(
    "Expected Difference is blank without a face value",
    expectedDifferenceAtMaturity({ ...sampleEd[0]!, faceValue: 0 }, pricedOf(sampleEd[0]!).result, surface) === null,
  );

  // Composer: the desk-spot unwind's values when no level is set, the level's own unwind when one is.
  let copied = 0;
  for (const p of book) {
    const { inputs, result } = pricedOf(p);
    const q = activeManagementQuote({ product: p, asOf: AS_OF, result, surface, fixings: inputs.expirySpots, target: actualTargetFor(p), expected: null, today: AS_OF });
    if (
      q.expectedDifferenceRs === expectedDifferenceAtMaturity(p, result, surface) &&
      q.exitValueRs === bookValue(p, result).exitValueRs &&
      q.expectedExitValueRs === q.exitValueRs
    ) {
      copied += 1;
    }
  }
  check("no expected level: Expected Difference and both Exit Values come from the desk-spot unwind", copied === book.length, `${copied} of ${book.length}`);
  const p735 = named("Nifty Accelerator - 735");
  const { inputs: in735, result: r735 } = pricedOf(p735);
  const up = expectedIrrAtLevel({ product: p735, surface, inputs: in735, level: NIFTY + 1000 });
  const moved = unwindAtLevel({ product: p735, surface, base: in735, level: NIFTY + 1000 });
  const q735 = activeManagementQuote({ product: p735, asOf: AS_OF, result: r735, surface, fixings: in735.expirySpots, target: actualTargetFor(p735), expected: up, today: AS_OF });
  const ed735 = expectedDifferenceAtMaturity(p735, r735, surface)!;
  check(
    "an expected level reprices Exit Value, Expected IRR and Expected Difference at that level",
    q735.expectedExitValueRs === bookValue(p735, moved).exitValueRs &&
      q735.expectedIrr === irrSet(moved, p735).currentIrr &&
      q735.expectedDifferenceRs === expectedDifferenceAtMaturity(p735, moved, surface) &&
      q735.exitValueRs === bookValue(p735, r735).exitValueRs &&
      q735.expectedExitValueRs! > q735.exitValueRs! &&
      q735.expectedDifferenceRs! > ed735,
    `${q735.exitValueRs} → ${q735.expectedExitValueRs}; ${ed735} → ${q735.expectedDifferenceRs}`,
  );
}

// Pending Observations: workbook BI without its bugs.
{
  const cases: Array<[string[], string | null]> = [
    [[], null],
    [["2026-07-28"], "Jul-26"],
    [["2026-07-28", "2026-10-27"], "Jul-26, Oct-26"],
    [["2026-11-24", "2026-12-29", "2027-01-25"], "Nov-26, Dec-26 & Jan-27"],
    [["2026-11-24", "2026-12-29", "2027-01-25", "2027-02-23"], "Nov-26, Dec-26, Jan-27 & Feb-27"],
    [["2027-03-30", "2027-06-29", "2027-09-28", "2027-12-28", "2028-03-28"], "Mar-27, Jun-27, Sep-27, Dec-27 & Mar-28"],
  ];
  const misses = cases
    .filter(([dates, want]) => pendingObservationsText(dates) !== want)
    .map(([dates]) => `${dates.length} dates → ${pendingObservationsText(dates)}`);
  check("Pending Observations format cases", misses.length === 0, misses.join("; "));
  let agree = 0;
  for (const p of book) {
    const { inputs, result } = pricedOf(p);
    const q = activeManagementQuote({ product: p, asOf: AS_OF, result, surface, fixings: inputs.expirySpots, target: actualTargetFor(p), expected: null, today: AS_OF });
    if (
      q.pendingObservations === pendingObservationsText(remainingObservationDays(p, AS_OF)) &&
      (q.pendingObservations == null) === (q.observationsLeft === 0)
    ) {
      agree += 1;
    }
  }
  check("Pending Observations lists the remaining observation days, blank when none are left", agree === book.length, `${agree} of ${book.length}`);
}

// Scenario cells carry Expected Difference, with its change 0 at k = 0.
{
  let centred = 0;
  for (const p of sample) {
    const { inputs, result } = pricedOf(p);
    const g = scenarioGrid({ product: p, surface, inputs, baseResult: result });
    if (
      g.base.expectedDifferenceRs === expectedDifferenceAtMaturity(p, result, surface) &&
      g.base.change.expectedDifferenceRs === 0 &&
      g.base.exitValueRs === bookValue(p, result).exitValueRs &&
      g.base.irr.currentIrr === irrSet(result, p).currentIrr &&
      // The AZ carry is settled cash, the same at every level.
      g.cells.every((c) => c.change.exitValueRs === c.change.unwindValueRs) &&
      g.cells.every((c) => c.change.expectedDifferenceRs === roundDeskMoney(c.expectedDifferenceRs! - g.base.expectedDifferenceRs!))
    ) {
      centred += 1;
    }
  }
  check("scenario cells carry Exit Value and Expected Difference, change 0 at k = 0", centred === sample.length, `${centred} of ${sample.length}`);
  const p961 = named("Nifty Accelerator - 961");
  const { inputs: in961 } = pricedOf(p961);
  const g961 = scenarioGrid({ product: p961, surface, inputs: in961 });
  const atLevelEd = (level: number) => expectedDifferenceAtMaturity(p961, unwindAtLevel({ product: p961, surface, base: in961, level }), surface);
  check(
    "each level's Expected Difference is that level's unwind grown to maturity, and rises with the index",
    g961.cells.every((c) => c.expectedDifferenceRs === atLevelEd(c.level)) &&
      g961.cells[20]!.expectedDifferenceRs! > g961.cells[0]!.expectedDifferenceRs!,
    `${g961.cells[0]!.expectedDifferenceRs} … ${g961.cells[20]!.expectedDifferenceRs}`,
  );
}

/** POST /api/multi/scenarios body work on three products, with fixed closes in place of Yahoo. */
async function bookScenarioChecks() {
  const three = [named("Nifty Accelerator - 961"), named("Nifty Accelerator - 740"), named("Gearing Sensex Accelerator - 22")];
  const closes = async (dates: string[], underlying: UnderlyingIndex) =>
    Object.fromEntries(dates.map((day) => [day, fixedClose(day, underlying)]));
  const rows = await bookScenarioRows({ products: three, surface, nifty: NIFTY, sensex: SENSEX, unwindDate: AS_OF, closes });
  let good = 0;
  for (const p of three) {
    const row = rows[productKey(p)];
    const underlying = underlyingFromProductName(p.productName, p.productCode);
    const r = computeUnwind({ product: p, surface, inputs: quoteBasis(p, (day) => fixedClose(day, underlying)) });
    const centre = row?.cells.find((c) => c.shift === 0);
    if (
      row != null &&
      centre != null &&
      row.cells.length === 21 &&
      row.cells.every((c, i) => c.shift === BOOK_SCENARIO_SHIFTS[i] && c.level === row.baseSpot + c.shift) &&
      row.baseSpot === (underlying === "Sensex" ? SENSEX : NIFTY) &&
      centre.unwindQuoteRs === r.unwindQuoteRs &&
      centre.premiumOutflowRs === r.masterEconomics.premiumOutflowRs &&
      centre.unwindValueRs === r.masterEconomics.unwindValueRs &&
      centre.exitValueRs === bookValue(p, r).exitValueRs &&
      centre.currentIrr === irrSet(r, p).currentIrr &&
      centre.expectedDifferenceRs === expectedDifferenceAtMaturity(p, r, surface)
    ) {
      good += 1;
    }
  }
  check(
    "book scenario rows: 21 shifts from −1,000 to +1,000, centre equal to the Product Book unwind",
    good === three.length && BOOK_SCENARIO_SHIFTS.length === 21 && BOOK_SCENARIO_SHIFTS[0] === -1000 && BOOK_SCENARIO_SHIFTS[20] === 1000,
    `${good} of ${three.length}`,
  );
  const failing = await bookScenarioRows({ products: three, surface, nifty: NIFTY, sensex: SENSEX, unwindDate: AS_OF, closes: async () => ({}) });
  check(
    "a product whose closes are missing is null and the rest still price (the error logged above is expected)",
    failing[productKey(three[1]!)] === null && failing[productKey(three[0]!)] != null && failing[productKey(three[2]!)] != null,
  );
}

void bookScenarioChecks()
  .catch((err) => check("book scenario checks ran", false, err instanceof Error ? err.message : String(err)))
  .then(() => {
    console.log(failures ? `\n${failures} Active Management checks FAILED` : "\nActive Management checks PASSED");
    if (failures) process.exit(1);
  });
