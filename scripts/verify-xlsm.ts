/**
 * Replay the reference XLSM (Calculator, Main Master, Pricer, Pricing Params,
 * MarketData) through the live engine. Option marks use that file's MarketData
 * grid, not the August 2026 desk surface.
 */
import { priceLeg } from "../lib/engine/pricer";
import { computeUnwind } from "../lib/engine/unwind";
import { parseISODate } from "../lib/utils";
import type { ProductMaster, VolSurface } from "../lib/types";
import raw from "../lib/data/xlsm-parity.json";
import productSeed from "../lib/data/product-master-seed.json";

let failures = 0;
function assertClose(label: string, actual: number, expected: number, tol: number) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: actual=${actual} expected=${expected} tol=${tol}`);
  if (!ok) failures += 1;
}

const md = raw.marketData;
const surface: VolSurface = {
  monthKey: "xlsm-sample",
  label: "XLSM MarketData",
  deepStrike: 500,
  moneyness: [],
  strikes: md.strikes,
  expiries: md.expiries,
  volsPercent: md.volsPercent,
  pricingParams: raw.pricingParams,
};

const productSeedMaster = productSeed as unknown as ProductMaster;
const cached = raw.calculatorCached;
const valuation = parseISODate(cached.unwindDate);
const spot = cached.spot;

// The live seed may carry New Primary observation dates. XLSM parity freezes each
// leg's expiry to the date that was on the reference Calculator Options Book.
const product: ProductMaster = {
  ...productSeedMaster,
  legs: productSeedMaster.legs.map((leg, i) => {
    const excelExpiry = raw.optionTableCached[i]?.expiry;
    return excelExpiry ? { ...leg, expiry: excelExpiry } : leg;
  }),
};

const first = product.legs[0];
const row0 = priceLeg({
  leg: first,
  spot,
  valuationDate: valuation,
  surface,
});
assertClose("xlsm first put vol", row0.volatility, 0.16065484933208093, 1e-6);
assertClose("xlsm first put discount yield", row0.discountYield, 0.08, 1e-12);
assertClose("xlsm first put forward", row0.forwardGrowth, 0.07, 1e-12);
// Desk marks ROUND to 2dp; the XLSM cache still holds the unrounded Black–Scholes print.
assertClose("xlsm first put price", row0.price, 944.33, 0.01);
assertClose("xlsm first put delta", row0.delta, -0.26350351332644095, 5e-4);

const second = product.legs[1];
const row1 = priceLeg({
  leg: second,
  spot,
  valuationDate: valuation,
  surface,
});
assertClose("xlsm second put price", row1.price, 923.58, 0.01);

const result = computeUnwind({
  product,
  surface,
  inputs: {
    debentures: cached.debentures,
    unwindDate: cached.unwindDate,
    spot,
  },
});

assertClose("xlsm amountWithNbfc", result.amountWithNbfc, cached.amountNBFC, 1e-12);
assertClose("xlsm nbfcGrown", result.nbfcGrownValue, cached.nbfcGrown, 1e-9);
assertClose("xlsm premium", result.premium, cached.premium, 1e-12);
assertClose("xlsm premGrown", result.premiumGrownValue, cached.premGrown, 1e-9);
assertClose("xlsm investedTenor", result.investedTenorDays, cached.investedTenor, 0);
assertClose("xlsm productIRR", result.productIRR, cached.productIRR, 1e-12);
assertClose("xlsm amtWithNbfcRs", result.masterEconomics.amtWithNbfcRs, 153939529.64863446, 1);
assertClose("xlsm grownValueRs", result.masterEconomics.grownValueRs, 247853363.35085598, 1);
assertClose("xlsm premGrownRs", result.masterEconomics.premGrownValueRs, 140443589.50519925, 1);
assertClose("xlsm premiumCreditedRs", result.masterEconomics.premiumCreditedRs, 128013497.9852534, 1);
assertClose("xlsm prdPremium0", result.optionRows[0]?.prdPremium ?? 0, 283988423.1908789, 1);

const pricedLegs = raw.optionTableCached.filter((r) => r.currentPrice && r.currentPrice > 0);
assertClose("xlsm priced calculator legs", pricedLegs.length, 10, 0);
for (const cachedRow of pricedLegs) {
  const live = result.optionRows.find(
    (r) => r.strike === cachedRow.strike && r.expiry.slice(0, 10) === cachedRow.expiry.slice(0, 10),
  );
  if (!live) {
    console.log(`FAIL missing live row ${cachedRow.strike} ${cachedRow.expiry}`);
    failures += 1;
    continue;
  }
  assertClose(
    `xlsm price ${cachedRow.strike} ${cachedRow.expiry.slice(0, 10)}`,
    live.currentPrice ?? 0,
    Math.round(cachedRow.currentPrice * 100) / 100,
    0.01,
  );
  assertClose(
    `xlsm premium ${cachedRow.strike} ${cachedRow.expiry.slice(0, 10)}`,
    live.premium ?? 0,
    cachedRow.premium,
    0.05,
  );
}

assertClose(
  "xlsm quote gap vs workbook is the 14 marked OTM legs",
  result.unwindQuotePct - cached.unwindQuotePct,
  0.002092,
  0.0005,
);

if (failures > 0) {
  console.error(`\nXLSM sheet checks FAILED (${failures})`);
  process.exit(1);
}
console.log("\nXLSM sheet checks PASSED");
console.log("xlsm unwind quote %", (result.unwindQuotePct * 100).toFixed(4), "workbook", (cached.unwindQuotePct * 100).toFixed(4));
console.log("xlsm prem outflow %", result.currentPremOutflowPct, "workbook", cached.premOutflow);
