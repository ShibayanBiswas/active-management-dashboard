/**
 * Collate Main Master products from every FY XLSM into one unique-ISIN book.
 * Identity = Product Code (desk ISIN / series code). Blank/zero Required Quantity
 * legs are already dropped by parseProductMasterBook. Sorted by trade date ascending.
 */
import fs from "node:fs";
import path from "node:path";

import { loadEnvLocal } from "./load-env";
import { persistMultiProducts } from "../lib/data/multi-load";
import { syncUnwindExpiries } from "./sync-observation-expiries";
import { isinKey, uniqueProductsByIsin } from "../lib/multi/product-key";
import type { ProductMaster } from "../lib/types";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";

loadEnvLocal();

const FILES: Array<{ path: string; label: string }> = [
  {
    label: "Apr'21-Mar'22 4.5 Fwd",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'21-Mar'22) 4.5 Fwd.xlsm`,
  },
  {
    label: "Apr'22-Mar'23 4.5fwd",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'22-Mar'23)_1_updated_4.5fwd.xlsm`,
  },
  {
    label: "Apr'23-Mar'24 4.5 Fwd",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'23-Mar'24) 4.5 Fwd.xlsm`,
  },
  {
    label: "Apr'24-Mar'25 4.5Fwd",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) 4.5Fwd.xlsm`,
  },
  {
    label: "Apr'25-Mar'26 6",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26) 6.xlsm`,
  },
  {
    label: "Apr'25-Mar'26 Sensex 4",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26)_Sensex Products 4.xlsm`,
  },
  {
    label: "Apr'26-Mar'27",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27).xlsm`,
  },
  {
    label: "Apr'26-Mar'27 Sensex",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27)_Sensex Products.xlsm`,
  },
];

function tradeTime(product: ProductMaster): number {
  const t = Date.parse(product.tradeDate);
  return Number.isFinite(t) ? t : 0;
}

function score(product: ProductMaster): number {
  // Prefer richer live books when the same ISIN appears in multiple FY files.
  return product.legs.length * 1_000_000 + Math.abs(product.mobilization);
}

function mergePrefer(a: ProductMaster, b: ProductMaster): ProductMaster {
  if (score(b) > score(a)) return b;
  if (score(a) > score(b)) return a;
  // Same richness — keep later trade date (fresher economics on the master).
  return tradeTime(b) >= tradeTime(a) ? b : a;
}

async function main() {
  const byIsin = new Map<string, { product: ProductMaster; source: string }>();
  let rawTotal = 0;
  let rawLegs = 0;

  for (const file of FILES) {
    if (!fs.existsSync(file.path)) {
      console.error("MISSING", file.label, file.path);
      process.exit(1);
    }
    console.log("\nParsing", file.label, "…");
    const started = Date.now();
    const buf = fs.readFileSync(file.path);
    const products = parseProductMasterBook(buf);
    const legs = products.reduce((n, p) => n + p.legs.length, 0);
    rawTotal += products.length;
    rawLegs += legs;
    console.log(
      `  → ${products.length} products / ${legs} live legs in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    for (const product of products) {
      if (!product.legs.length) continue;
      const key = isinKey(product);
      const prev = byIsin.get(key);
      if (!prev) {
        byIsin.set(key, { product, source: file.label });
        continue;
      }
      const winner = mergePrefer(prev.product, product);
      byIsin.set(key, {
        product: winner,
        source: winner === product ? file.label : prev.source,
      });
    }
  }

  const collated = uniqueProductsByIsin(
    [...byIsin.values()]
      .map((entry) => entry.product)
      .sort((a, b) => {
        const dt = tradeTime(a) - tradeTime(b);
        if (dt !== 0) return dt;
        return a.productCode.localeCompare(b.productCode);
      }),
  );

  const legCount = collated.reduce((n, p) => n + p.legs.length, 0);
  const codes = new Set(collated.map(isinKey));
  console.log("\n=== Collation ===");
  console.log("raw products across files", rawTotal, "raw live legs", rawLegs);
  console.log("unique ISINs (product codes)", codes.size);
  console.log("collated products", collated.length, "live legs", legCount);
  console.log(
    "first",
    collated[0]?.tradeDate?.slice(0, 10),
    collated[0]?.productName,
    collated[0]?.productCode,
  );
  console.log(
    "last",
    collated[collated.length - 1]?.tradeDate?.slice(0, 10),
    collated[collated.length - 1]?.productName,
    collated[collated.length - 1]?.productCode,
  );

  if (codes.size !== collated.length) {
    console.error("FAIL unique ISIN count mismatch");
    process.exit(1);
  }

  const expirySync = syncUnwindExpiries(collated);
  console.log("new primary expiry sync", expirySync);

  const jsonPath = path.join(process.cwd(), "lib/data/multi-products-seed.json");
  fs.writeFileSync(jsonPath, JSON.stringify(collated));
  console.log("wrote", jsonPath, fs.statSync(jsonPath).size);

  const persisted = await persistMultiProducts(collated, "collate-fy21-to-fy27");
  console.log("mongo persisted", persisted);
  console.log("Next: npm run build:samples");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
