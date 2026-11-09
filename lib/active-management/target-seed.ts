import seed from "@/lib/data/am-targets-seed.json";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import type { ActualTarget } from "@/lib/active-management/book-row";
import { actualTarget } from "@/lib/active-management/targets";

const TARGETS = seed as Record<string, { target: number; isin: string }>;

/**
 * Actual Target: the New Primary master's Target Nifty (workbook Calculator!AR, baked by
 * `npm run bake:am-targets`), else the highest original-Sell Put strike.
 * The seed is about 130 KB, so this stays on the server (the quotes route); the client reads
 * the result from MultiQuote.am. targets.ts stays free of it for client use.
 */
export function actualTargetFor(product: ProductMaster): ActualTarget {
  const seeded = TARGETS[productKey(product)]?.target;
  const target = actualTarget(product, "topSellPutStrike", seeded);
  if (target == null) return { target: null, source: null };
  return { target, source: seeded != null && seeded > 0 ? "Product Master" : "Top Sell Put Strike" };
}
