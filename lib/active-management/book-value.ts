import type { ProductMaster, UnwindResult } from "@/lib/types";
import { daysBetween, parseISODate, roundDeskMoney } from "@/lib/utils";

/**
 * Workbook List of Products AZ (Grown Outflow), summed over the product:
 *   AZ = IF(Expiry < Valuation, AY × Premium Discounting Rate × (Valuation − Expiry) ÷ 365, 0)
 * AY is the settled option cash on the whole issue (intrinsic × Required Quantity, Main Master AC),
 * so this is simple interest on a payout from its expiry to the valuation date, whatever number of
 * debentures the unwind was typed with. Unwinding has no such term, so it stays out of
 * masterEconomics; the Active Management book figures add it, as Calculator K does.
 */
export function settledOutflowCarryRs(
  product: Pick<ProductMaster, "premDiscRate">,
  result: Pick<UnwindResult, "optionRows" | "unwindDate">,
): number {
  const valuation = parseISODate(result.unwindDate);
  let carry = 0;
  for (const row of result.optionRows) {
    if (!row.expired) continue;
    const days = daysBetween(parseISODate(row.expiry), valuation);
    // An expired row's unwindPrice is its intrinsic, the price masterEconomics sums on the issue.
    if (days > 0) carry += (roundDeskMoney(row.unwindPrice * row.issueQuantity) * product.premDiscRate * days) / 365;
  }
  return roundDeskMoney(carry);
}

type BookValue = {
  /** Σ AZ for the whole issue: carry on settled option cash from each expiry to the valuation date. */
  settledCarryRs: number;
  /**
   * Workbook BH Exit Value (F + H + J + K), whole issue: Unwinding's Unwind Value (Main Master AU,
   * itself whole issue, with its residual-margin term) plus the AZ carry.
   */
  exitValueRs: number;
  /** Workbook L Unwind Price: Exit Value ÷ Total Debentures, per debenture. */
  bookQuoteRs: number;
};

/** The Active Management book figures (workbook K, L, BH) off one unwind. */
export function bookValue(
  product: Pick<ProductMaster, "premDiscRate">,
  result: Pick<UnwindResult, "optionRows" | "unwindDate" | "masterEconomics" | "totalDebs">,
): BookValue {
  const settledCarryRs = settledOutflowCarryRs(product, result);
  const exitValueRs = roundDeskMoney(result.masterEconomics.unwindValueRs + settledCarryRs);
  const debentures = result.totalDebs;
  const bookQuoteRs = Number.isFinite(debentures) && debentures > 0 ? roundDeskMoney(exitValueRs / debentures) : 0;
  return { settledCarryRs, exitValueRs, bookQuoteRs };
}
