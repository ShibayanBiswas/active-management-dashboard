/**
 * Active Management add-ons on the seeded live book, offline: the design test plan (observation facts,
 * Residual Target parity, Max IRR, the scenario ladder, expired legs, Sensex shift, missing closes,
 * Pricer alignment, flat ladders), the Actual Target seed and the Product Book composer.
 * As-of, desk spots and expiry closes are fixed, so nothing reaches Yahoo or Mongo. Exits non-zero on any failure.
 */
import multiSeed from "../lib/data/multi-products-seed.json";
import targetSeed from "../lib/data/am-targets-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import { activeManagementQuote } from "../lib/active-management/book-row";
import { maxIrr } from "../lib/active-management/irr";
import { observationFacts, productHasProgressTab } from "../lib/active-management/observations";
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
import { collectExpiredLegExpiryDates, legExpiryYmd } from "../lib/engine/expiry-spots";
import { computeUnwind } from "../lib/engine/unwind";
import { normalizeVolSurface } from "../lib/engine/vol-surface";
import { issuedCount, productKey, uniqueProductsByIsin } from "../lib/multi/product-key";
import { observationDatesForProduct, productsWithLiveMaturity, remainingObservationDays } from "../lib/observation-tabs";
import type { ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "../lib/types";
import { underlyingFromProductName } from "../lib/utils";

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
    return activeManagementQuote({ product: p, asOf: AS_OF, result, fixings: fixings ?? inputs.expirySpots, target: actualTargetFor(p), expected, today });
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
  const noCap = am(named("Nifty Magnifier - 829"), null);
  check(
    "coupon 0 leaves Max IRR blank and Current IRR uncapped",
    noCap.maxIrr == null && noCap.currentIrr === pricedOf(named("Nifty Magnifier - 829")).result.clientIRR && has(noCap.warnings, "No Max IRR Cap Because Coupon Or Tenor Is Zero"),
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
  check(
    "a non-positive quote at the assumed level blanks Expected IRR",
    crash.unwindQuoteRs <= 0 && crashed.expectedIrr == null && has(crashed.warnings, "Expected IRR Blank Because Unwind Quote Is Not Positive"),
    crash.unwindQuoteRs.toFixed(2),
  );
  const guarded = activeManagementQuote({
    product: p740,
    asOf: AS_OF,
    result: { ...pricedOf(p740).result, investedTenorDays: 0, clientIRR: 0 },
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

console.log(failures ? `\n${failures} Active Management checks FAILED` : "\nActive Management checks PASSED");
if (failures) process.exit(1);
