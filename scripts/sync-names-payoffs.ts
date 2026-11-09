/**
 * Keep option expiries as already synced from New Primary.
 * A matched series takes the New Primary listed name, including when the
 * product number in the two names differs. Copy payoff text from the Swap Product master.
 */
import fs from "node:fs";
import path from "node:path";

import type { ProductMaster } from "../lib/types";
import { isinKey } from "../lib/multi/product-key";
import {
  indexNewPrimaryProducts,
  listedNewPrimaryName,
  matchNewPrimaryProduct,
  observationBaseName,
} from "./sync-observation-expiries";

const root = process.cwd();
const multiPath = path.join(root, "lib/data/multi-products-seed.json");
const singlePath = path.join(root, "lib/data/product-master-seed.json");
const publicSingle = path.join(root, "public/data/product-master-seed.json");
const secondaryPath = path.resolve(root, "../Secondary SP Dashboard/lib/data/master-seed.json");
const swapPath = path.resolve(root, "../Swap Product/lib/data/multi-products-seed.json");

/** Product numbers (3+ digits). Coupon percents and phase digits are ignored. */
function productIds(name: string): string {
  return [...name.matchAll(/\d{3,}/g)].map((match) => match[0]).join(",");
}

function sameListedProduct(unwindName: string, listedName: string): boolean {
  if (observationBaseName(unwindName) === observationBaseName(listedName)) return true;
  const left = productIds(unwindName);
  const right = productIds(listedName);
  return left.length > 0 && left === right;
}

function compactCode(code: string): string {
  return code.toUpperCase().replace(/[\s\u00a0]+/g, "");
}

function applyBook(products: ProductMaster[], label: string) {
  const secondary = JSON.parse(fs.readFileSync(secondaryPath, "utf8")) as {
    products: Parameters<typeof indexNewPrimaryProducts>[0];
  };
  const swap = JSON.parse(fs.readFileSync(swapPath, "utf8")) as ProductMaster[];
  const bySeries = indexNewPrimaryProducts(secondary.products);
  const swapByCode = new Map<string, string>();
  const swapByCompact = new Map<string, string>();
  for (const product of swap) {
    const formula = String(product.formulae ?? "").trim();
    if (!formula) continue;
    swapByCode.set(isinKey(product), formula);
    swapByCompact.set(compactCode(product.productCode), formula);
  }

  let matched = 0;
  let renamed = 0;
  let nameKept = 0;
  let nameConflict = 0;
  let formulasFilled = 0;
  let formulasUpdated = 0;
  let formulasMissing = 0;
  const renameExamples: string[] = [];
  const conflictExamples: string[] = [];

  for (const product of products) {
    const beforeExpiry = product.legs.map((leg) => leg.expiry).join("|");
    const hit = matchNewPrimaryProduct(product, bySeries);
    if (hit) {
      matched += 1;
      const listed = listedNewPrimaryName(hit);
      if (listed && listed !== product.productName.trim()) {
        if (renameExamples.length < 12) {
          renameExamples.push(`${product.productCode}: ${product.productName} → ${listed}`);
        }
        if (!sameListedProduct(product.productName, listed)) nameConflict += 1;
        product.productName = listed;
        renamed += 1;
      } else {
        nameKept += 1;
      }
    }
    const formula =
      swapByCode.get(isinKey(product)) ?? swapByCompact.get(compactCode(product.productCode)) ?? "";
    if (!formula) {
      formulasMissing += 1;
    } else if (formula !== String(product.formulae ?? "").trim()) {
      if (!String(product.formulae ?? "").trim()) formulasFilled += 1;
      else formulasUpdated += 1;
      product.formulae = formula;
    }
    const afterExpiry = product.legs.map((leg) => leg.expiry).join("|");
    if (afterExpiry !== beforeExpiry) {
      throw new Error(`${label} expiry changed on ${product.productCode}`);
    }
  }

  return {
    label,
    products: products.length,
    matched,
    renamed,
    nameKept,
    nameConflict,
    formulasFilled,
    formulasUpdated,
    formulasMissing,
    blankAfter: products.filter((product) => !String(product.formulae ?? "").trim()).length,
    renameExamples,
    conflictExamples,
  };
}

function main() {
  const write = process.argv.includes("--write");
  const multi = JSON.parse(fs.readFileSync(multiPath, "utf8")) as ProductMaster[];
  const single = JSON.parse(fs.readFileSync(singlePath, "utf8")) as ProductMaster;
  const multiStats = applyBook(multi, "multi");
  const singleStats = applyBook([single], "single");
  console.log(JSON.stringify({ multi: multiStats, single: singleStats, write }, null, 2));
  if (!write) {
    console.log("Dry run. Pass --write to update seeds.");
    return;
  }
  fs.writeFileSync(multiPath, JSON.stringify(multi));
  const pretty = `${JSON.stringify(single, null, 2)}\n`;
  fs.writeFileSync(singlePath, pretty);
  fs.writeFileSync(publicSingle, pretty);
  console.log("Wrote multi seed, single seed, and public single seed. Expiries unchanged.");
}

main();
