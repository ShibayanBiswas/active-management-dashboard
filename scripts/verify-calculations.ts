import { computeUnwind } from "../lib/engine/unwind";
import { priceLeg } from "../lib/engine/pricer";
import type { ProductMaster, VolSurface } from "../lib/types";
import golden from "../lib/data/golden-parity.json";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-golden-sep-2026.json";
// September 2026 golden surface: the parity locks stay on it when the monthly seed moves on.
import { computeRowSpans, parseISODate } from "../lib/utils";

function assertClose(label: string, actual: number, expected: number, tol: number) {
  const ok = Math.abs(actual - expected) <= tol;
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status} ${label}: actual=${actual} expected=${expected} tol=${tol}`);
  if (!ok) process.exitCode = 1;
}

const product = productSeed as ProductMaster;
const surface = volSeed as VolSurface;

const result = computeUnwind({
  product,
  surface,
  inputs: {
    debentures: golden.inputs.debentures,
    unwindDate: golden.inputs.unwindDate,
    spot: golden.inputs.spot,
  },
});

assertClose("amountWithNbfc", result.amountWithNbfc, golden.expected.amountWithNbfc, 1e-6);
assertClose("nbfcGrown", result.nbfcGrownValue, golden.expected.nbfcGrown, 5e-4);

// Whole-book rupee economics vs golden expected values (21-Feb-25 unwind)
assertClose("premiumCreditedRs", result.masterEconomics.premiumCreditedRs, 128013497.99, 2000);
assertClose("amtWithNbfcRs", result.masterEconomics.amtWithNbfcRs, 153939529.65, 2000);
assertClose("grownValueRs", result.masterEconomics.grownValueRs, 247853363.35, 150000);
assertClose("premGrownValueRs", result.masterEconomics.premGrownValueRs, 140443589.51, 150000);
assertClose("premium", result.premium, golden.expected.premium, 1e-4);
assertClose("premGrown", result.premiumGrownValue, golden.expected.premGrown, 0.002);
assertClose("productIRR", result.productIRR, golden.expected.productIRR, 0.001);
assertClose("investedTenor", result.investedTenorDays, golden.expected.investedTenor, 1);

// First leg price vs golden expected value
const leg0 = product.legs[0];
const priced = priceLeg({
  leg: leg0,
  spot: golden.inputs.spot,
  valuationDate: parseISODate(golden.inputs.unwindDate),
  surface,
});
assertClose("optionPrice0", priced.price, golden.expected.optionPrice0, 1);
assertClose("optionPremium0", result.optionRows[0]?.premium ?? 0, golden.expected.optionPremium0, 80);
const scale = golden.inputs.debentures / result.totalDebs;
const spanDemo = computeRowSpans([
  ["Put", "23,408", "A"],
  ["Put", "23,408", "B"],
  ["Put", "22,880", "C"],
]);
assertClose("span club col0", spanDemo[0][0], 3, 0);
assertClose("span skip covered", spanDemo[1][0], 0, 0);
assertClose("span club strike", spanDemo[0][1], 2, 0);
assertClose("span unique cell", spanDemo[2][2], 1, 0);

assertClose("master legs", product.legs.length, 24, 0);
assertClose("option rows", result.optionRows.length, 24, 0);
const optionKeys = new Set(result.optionRows.map((r) => `${r.strike}|${r.expiry}`));
assertClose("unique strike+expiry rows", optionKeys.size, 24, 0);
const spreadBook = computeUnwind({
  product,
  surface,
  inputs: {
    debentures: golden.inputs.debentures,
    unwindDate: golden.inputs.unwindDate,
    spot: golden.inputs.spot,
    bidAskSpread: 0.02,
  },
});
const mid0 = spreadBook.optionRows[0]?.currentPrice ?? 0;
const uw0 = spreadBook.optionRows[0]?.unwindPrice ?? 0;
assertClose("current != unwind when bid-ask is on", mid0 === uw0 ? 1 : 0, 0, 0);
assertClose("unwind buy is signed negative", Math.sign(uw0), -1, 0);

assertClose("qty0", result.optionRows[0]?.quantity ?? 0, (-88313.21022727272) * scale, 0.05);
assertClose("qty1 matches qty0", result.optionRows[1]?.quantity ?? 0, result.optionRows[0]?.quantity ?? 0, 1e-9);
assertClose("qty19008", result.optionRows[8]?.quantity ?? 0, 3396.661931818182 * scale, 0.05);
assertClose("qty14608aug", result.optionRows[18]?.quantity ?? 0, 29296.209161931813 * scale, 0.05);
assertClose("bookBuy", result.optionRows.filter((r) => r.unwind === "Sell").length, 16, 0);
assertClose("bookSell", result.optionRows.filter((r) => r.unwind === "Buy").length, 8, 0);

// Product Premium column uses the per-leg product price (golden row values)
assertClose("premiumPerSpread0", result.optionRows[0]?.premiumPerSpread ?? 0, 3215.6958450501234, 0.05);
assertClose("prdPremium0", result.optionRows[0]?.prdPremium ?? 0, 283988423.19, 2000);
assertClose("prdPremium5", result.optionRows[5]?.prdPremium ?? 0, -240132552.91, 2000);
assertClose("prdPremium23", result.optionRows[23]?.prdPremium ?? 0, -1266380.68, 100);

assertClose("premOutflow", result.currentPremOutflowPct, golden.expected.premOutflow, 0.05);
assertClose("pricerUnwind", result.pricerUnwindValue, golden.expected.pricerUnwind, 0.08);
assertClose("unwindQuotePct", result.unwindQuotePct, golden.expected.unwindQuotePct, 0.08);
assertClose("unwindQuoteRs", result.unwindQuoteRs, golden.expected.unwindQuoteRs, 12000);
assertClose("clientIRR", result.clientIRR, golden.expected.clientIRR, 0.05);
assertClose("residualIRR", result.residualIRR, golden.expected.residualIRR, 0.05);

console.log("\nOption rows:", result.optionRows.length);
console.log("Unwind quote %:", (result.unwindQuotePct * 100).toFixed(4));
console.log(process.exitCode ? "\nCalculation checks FAILED" : "\nCalculation checks PASSED");
