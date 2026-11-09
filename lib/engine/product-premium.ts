import type { ProductMaster } from "@/lib/types";

/**
 * Initial premium credited, as a positive fraction of mobilisation.
 *
 * The amount is the absolute value of Σ (Product Price × −Required Quantity) across
 * the live legs. A sell quantity is negative, so the flip brings that premium in.
 * Blank, zero, and "+" / "-" placeholder quantities are not legs. A stored Premium
 * Credited cell is not used once any leg has a product price: that cell can still
 * hold a doubled or pre-dedupe total.
 */
export function bookPremiumFraction(product: ProductMaster): number {
  const costFallback = Math.max(0, product.inbuilt + product.tranCost + product.issuanceCost);

  const asPositiveFraction = (fraction: number): number => {
    if (!Number.isFinite(fraction)) return costFallback;
    const magnitude = Math.abs(fraction);
    return magnitude > 0 ? magnitude : costFallback;
  };

  if (!(product.mobilization > 0)) {
    return costFallback;
  }

  let credited = 0;
  let priced = 0;
  for (const leg of product.legs ?? []) {
    const qty = leg.reqQuantity;
    if (qty == null || !Number.isFinite(qty) || qty === 0) continue;
    const price = leg.prdPrice ?? product.prdPrice;
    if (price == null || !Number.isFinite(price)) continue;
    credited += price * -qty;
    priced += 1;
  }
  if (priced > 0) return asPositiveFraction(credited / product.mobilization);
  return costFallback;
}

/** Rupee Premium Credited — always ≥ 0. */
export function bookPremiumCreditedRs(product: ProductMaster): number {
  const fraction = bookPremiumFraction(product);
  if (!(product.mobilization > 0) || !(fraction > 0)) return 0;
  return fraction * product.mobilization;
}
