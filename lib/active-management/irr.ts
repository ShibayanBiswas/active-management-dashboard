import { bookValue } from "@/lib/active-management/book-value";
import { rateZeroCoupon } from "@/lib/engine/unwind";
import type { ProductMaster, UnwindResult } from "@/lib/types";

/**
 * Max IRR = (1 + Coupon)^(365 / Tenor Days) − 1 (workbook Calculator!BG).
 * Identical to Unwinding's productIRR = rateZeroCoupon(tenor/365, face, face × (1 + coupon)),
 * which is face-free. Null (no cap) when tenor ≤ 0 or coupon ≤ 0: rateZeroCoupon would return 0
 * and capping every IRR at 0% is a data gap, not a result (12 live products carry coupon 0).
 */
export function maxIrr(product: Pick<ProductMaster, "coupon" | "tenorDays">): number | null {
  if (!(product.tenorDays > 0) || !(product.coupon > 0)) return null;
  return rateZeroCoupon(product.tenorDays / 365, 1, 1 + product.coupon);
}

/** Workbook IF(irr > cap, cap, irr). No cap → irr unchanged. */
export function capIrr(irr: number | null, cap: number | null): number | null {
  if (irr == null || !Number.isFinite(irr)) return null;
  return cap == null ? irr : Math.min(irr, cap);
}

export type IrrFlags = {
  /** Invested tenor 0 (valuation on/before allotment): rateZeroCoupon returned its 0 guard. */
  noInvestedTenor: boolean;
  /** Book quote (Exit Value ÷ debentures) ≤ 0: rateZeroCoupon returned 0, not a real rate. */
  nonPositiveQuote: boolean;
  /** Coupon ≤ 0 or tenor ≤ 0: Max IRR blank, Current IRR uncapped. */
  noCap: boolean;
};

export type IrrSet = {
  productIRR: number;
  /** Unwinding's Client IRR on the headline quote (mid marks), as the Unwinding page shows it. */
  clientIRR: number;
  residualIRR: number;
  /** Workbook U: rateZeroCoupon(invested days, face, book quote) with the book quote from bookValue (side marks plus AZ). */
  bookIRR: number;
  maxIrr: number | null;
  /** min(Book IRR, Max IRR) — workbook "Curr IRR" (Summary!G = MIN(Calculator U, BG)). */
  currentIrr: number | null;
  flags: IrrFlags;
};

/**
 * The rates for one unwind. Current IRR follows the workbook: Calculator U is the zero-coupon rate
 * on L, the book Unwind Price (side marks from the Bid Ask spread, plus the AZ carry on settled
 * cash), not on Unwinding's headline quote, which uses mid marks.
 */
export function irrSet(
  result: Pick<
    UnwindResult,
    | "productIRR"
    | "clientIRR"
    | "residualIRR"
    | "investedTenorDays"
    | "faceValue"
    | "totalDebs"
    | "unwindDate"
    | "masterEconomics"
    | "optionRows"
  >,
  product: Pick<ProductMaster, "coupon" | "tenorDays" | "premDiscRate">,
): IrrSet {
  const cap = maxIrr(product);
  const { bookQuoteRs } = bookValue(product, result);
  const bookIRR = rateZeroCoupon(result.investedTenorDays / 365, result.faceValue, bookQuoteRs);
  const flags: IrrFlags = {
    noInvestedTenor: !(result.investedTenorDays > 0),
    nonPositiveQuote: !(bookQuoteRs > 0),
    noCap: cap == null,
  };
  const guarded = flags.noInvestedTenor || flags.nonPositiveQuote;
  return {
    productIRR: result.productIRR,
    clientIRR: result.clientIRR,
    residualIRR: result.residualIRR,
    bookIRR,
    maxIrr: cap,
    currentIrr: guarded ? null : capIrr(bookIRR, cap),
    flags,
  };
}
