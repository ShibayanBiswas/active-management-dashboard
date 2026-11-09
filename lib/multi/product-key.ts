import type { ProductMaster } from "@/lib/types";

type ProductIdentity = Pick<ProductMaster, "productName" | "productCode">;

/**
 * Desk product identity: Product Code (ISIN / series) first.
 * Name is used only when Product Code is blank — never double-count the same ISIN.
 */
export function isinKey(product: ProductIdentity): string {
  const code = product.productCode.trim();
  if (code) return code.toUpperCase();
  return product.productName.trim().toUpperCase();
}

/** Stable map / selection key — same as {@link isinKey}. */
export function productKey(product: ProductIdentity): string {
  return isinKey(product);
}

function richness(product: ProductMaster): number {
  return product.legs.length * 1_000_000 + Math.abs(product.mobilization);
}

/**
 * One row per ISIN (Product Code). If the same code appears twice, keep the richer
 * live book. Blank codes fall back to unique Product Name.
 */
export function uniqueProductsByIsin(products: ProductMaster[]): ProductMaster[] {
  const byIsin = new Map<string, ProductMaster>();
  const order: string[] = [];
  for (const product of products) {
    const key = isinKey(product);
    if (!key) continue;
    const prev = byIsin.get(key);
    if (!prev) {
      byIsin.set(key, product);
      order.push(key);
      continue;
    }
    if (richness(product) > richness(prev)) byIsin.set(key, product);
  }
  return order.map((key) => byIsin.get(key)!).filter(Boolean);
}

export function issuedCount(product: ProductMaster): number {
  if (!(product.faceValue > 0)) return 1;
  return Math.max(1, Math.round(product.mobilization / product.faceValue));
}
