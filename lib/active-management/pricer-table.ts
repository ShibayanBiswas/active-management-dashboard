import { legExpiryYmd } from "@/lib/engine/expiry-spots";
import { priceProductBook } from "@/lib/engine/pricer";
import type { PricerRow, ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import { deskPricingSpot, underlyingFromProductName } from "@/lib/utils";

/** One Pricer Table row for the product, joined to its Options Book row from the same unwind. */
export type ProductPricerRow = PricerRow & {
  originalSide: string;
  unwindSide: string;
  unwindQuantity: number;
  /** Options Book Unwind Option Price: the side mark live, intrinsic once expired. */
  unwindOptionPrice: number;
  premiumOutflowRs: number;
  /** Close the expired leg settled at; null while live. */
  settlementFixing: number | null;
};

/**
 * Per-product Black–Scholes table. Pricer columns come from priceProductBook (the Unwinding
 * Pricer page call); the Options Book columns come from result.optionRows. Both walk the same
 * live legs in the same order (verified on 300 products), so rows join by index.
 */
export function productPricerTable(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  result: UnwindResult;
}): ProductPricerRow[] {
  const { product, surface, inputs, result } = args;
  const underlying =
    inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
      ? inputs.underlying
      : underlyingFromProductName(product.productName, product.productCode);
  const spot = deskPricingSpot({ ...inputs, underlying }) ?? inputs.spot;
  const rows = priceProductBook({
    product,
    spot,
    valuationDate: inputs.unwindDate,
    surface,
    bidAskSpread: inputs.bidAskSpread ?? 0,
    underlying,
  });
  if (rows.length !== result.optionRows.length) {
    throw new Error("Pricer rows and Options Book rows are out of step");
  }
  return rows.map((row, i) => {
    const book = result.optionRows[i]!;
    return {
      ...row,
      originalSide: book.original,
      unwindSide: book.unwind,
      unwindQuantity: book.quantity,
      unwindOptionPrice: Math.abs(book.unwindPrice),
      premiumOutflowRs: book.premiumOutflowRs,
      settlementFixing: book.expired ? inputs.expirySpots?.[legExpiryYmd(book.expiry)] ?? null : null,
    };
  });
}
