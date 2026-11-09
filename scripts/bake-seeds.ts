/**
 * Bake JSON seeds from _raw_extract.json for runtime + Mongo seed.
 * Golden expected values are recomputed on the August 2026 vol surface so they
 * stay aligned with Surface Parameters (1 Aug 2026 Nifty/Sensex references).
 */
import fs from "node:fs";
import path from "node:path";

import { priceLeg } from "../lib/engine/pricer";
import { computeUnwind } from "../lib/engine/unwind";
import type { ProductMaster, VolSurface } from "../lib/types";
import { parseISODate } from "../lib/utils";
import volSeed from "../lib/data/vol-surface-golden-sep-2026.json";
// September 2026 golden surface: the parity locks stay on it when the monthly seed moves on.
import { syncUnwindExpiries } from "./sync-observation-expiries";

const root = process.cwd();
const rawPath = path.join(root, "lib/data/_raw_extract.json");
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));

// Volatility surface is the August 2026 MarketData book. Re-import with
// `npx tsx scripts/import-aug-vol.ts` — do not overwrite it from the old July extract.

// Quantity divisors: leg 0 full, quarterly legs 1..17 one third, deep legs full
const QTY_DIVISORS = [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1];

const product = {
  ...raw.product,
  premiumFraction: raw.calculatorCached.premium,
  legs: raw.legs.map((l: Record<string, unknown>, i: number) => ({
    ...l,
    qtyDivisor: QTY_DIVISORS[i] ?? 1,
  })),
};

syncUnwindExpiries([product as ProductMaster]);

const surface = volSeed as VolSurface;
const inputs = {
  debentures: raw.calculatorCached.debentures as number,
  unwindDate: raw.calculatorCached.unwindDate as string,
  spot: raw.calculatorCached.spot as number,
};
const result = computeUnwind({
  product: product as ProductMaster,
  surface,
  inputs,
});
const priced0 = priceLeg({
  leg: (product as ProductMaster).legs[0]!,
  spot: inputs.spot,
  valuationDate: parseISODate(inputs.unwindDate),
  surface,
});

const golden = {
  inputs,
  expected: {
    unwindQuotePct: result.unwindQuotePct,
    unwindQuoteRs: result.unwindQuoteRs,
    productIRR: result.productIRR,
    clientIRR: result.clientIRR,
    residualIRR: result.residualIRR,
    amountWithNbfc: result.amountWithNbfc,
    nbfcGrown: result.nbfcGrownValue,
    premium: result.premium,
    premGrown: result.premiumGrownValue,
    premOutflow: result.currentPremOutflowPct,
    pricerUnwind: result.pricerUnwindValue,
    investedTenor: result.investedTenorDays,
    optionPremium0: result.optionRows[0]?.premium ?? 0,
    optionPrice0: priced0.price,
  },
};

fs.writeFileSync(path.join(root, "lib/data/product-master-seed.json"), JSON.stringify(product, null, 2));
fs.writeFileSync(path.join(root, "lib/data/golden-parity.json"), `${JSON.stringify(golden, null, 2)}\n`);
fs.writeFileSync(path.join(root, "public/data/product-master-seed.json"), JSON.stringify(product, null, 2));

console.log("Baked product-master-seed and golden-parity from the August 2026 surface.");
console.log("961 quote%", golden.expected.unwindQuotePct, "first price", golden.expected.optionPrice0);
