/**
 * Bake the Actual Target seed for the Active Management columns.
 *
 *   npm run bake:am-targets
 *
 * Actual Target is the New Primary master's "Target Nifty" (workbook Calculator!AR =
 * XLOOKUP(product, Primary!D, Primary!L)). Sensex rows carry their Sensex target in the same
 * column (the header is historical; "Target Level" exists only on the Maximizer rows and equals
 * it). Products match on series, rollover phase and name, the same matcher the expiry and name
 * syncs use. The seed is keyed by productKey; unmatched products fall back to the top Sell Put strike.
 */
import fs from "node:fs";
import path from "node:path";

import { targetCandidates } from "../lib/active-management/targets";
import { productKey } from "../lib/multi/product-key";
import type { ProductMaster } from "../lib/types";
import { underlyingFromProductName } from "../lib/utils";
import {
  indexNewPrimaryProducts,
  listedNewPrimaryName,
  matchNewPrimaryProduct,
} from "./sync-observation-expiries";

const root = process.cwd();
const secondaryPath = path.resolve(
  root,
  process.env.NEW_PRIMARY_SEED ?? "../Secondary SP Dashboard/lib/data/master-seed.json",
);
const multiPath = path.join(root, "lib/data/multi-products-seed.json");
const outPath = path.join(root, "lib/data/am-targets-seed.json");

/** "24,920", 24920 or "24920.5" → number; blank, "-" and 0 → null. */
function parseLevel(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? "").replace(/[,\s ]/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

function main() {
  if (!fs.existsSync(secondaryPath)) {
    console.error(`New Primary seed not found: ${secondaryPath}`);
    process.exit(1);
  }
  const secondary = JSON.parse(fs.readFileSync(secondaryPath, "utf8")) as {
    products: Parameters<typeof indexNewPrimaryProducts>[0];
  };
  const multi = JSON.parse(fs.readFileSync(multiPath, "utf8")) as ProductMaster[];
  const bySeries = indexNewPrimaryProducts(secondary.products);

  const seed: Record<string, { target: number; isin: string }> = {};
  let matched = 0;
  let unmatched = 0;
  let blankTarget = 0;
  let sensex = 0;
  let sameAsStrike = 0;
  let noStrike = 0;
  let targetLevelConflict = 0;
  const differs: string[] = [];
  const blanks: string[] = [];

  for (const product of multi) {
    const hit = matchNewPrimaryProduct(product, bySeries);
    if (!hit) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const raw = hit.raw ?? {};
    const target = parseLevel(raw["Target Nifty"]);
    const level = parseLevel(raw["Target Level"]);
    if (level != null && target != null && level !== target) targetLevelConflict += 1;
    if (target == null) {
      blankTarget += 1;
      if (blanks.length < 8) blanks.push(`${product.productName} | ${product.productCode} | ${listedNewPrimaryName(hit)}`);
      continue;
    }
    const isin = String(hit.isin || raw["ISIN No."] || "").trim();
    seed[productKey(product)] = { target, isin };
    if (underlyingFromProductName(product.productName, product.productCode) === "Sensex") sensex += 1;
    const strike = targetCandidates(product).topSellPutStrike;
    if (strike == null) noStrike += 1;
    else if (Math.abs(strike - target) < 0.5) sameAsStrike += 1;
    else differs.push(`${product.productName} | ${product.productCode} | Target Nifty ${target} | Top Sell Put Strike ${strike}`);
  }

  const baked = Object.keys(seed).length;
  console.log(
    JSON.stringify(
      {
        newPrimary: secondaryPath,
        products: multi.length,
        matched,
        unmatched,
        blankTarget,
        baked,
        sensex,
        targetLevelConflict,
        sameAsTopSellPutStrike: sameAsStrike,
        differsFromTopSellPutStrike: differs.length,
        noSellPut: noStrike,
        differExamples: differs.slice(0, 24),
        blankExamples: blanks,
      },
      null,
      2,
    ),
  );

  const sorted = Object.fromEntries(Object.entries(seed).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(outPath, `${JSON.stringify(sorted)}\n`);
  console.log(`Wrote ${baked} targets to ${path.relative(root, outPath)}.`);
}

main();
