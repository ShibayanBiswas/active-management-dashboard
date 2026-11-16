import type { ProductMaster, UnwindResult } from "@/lib/types";
import { daysBetween, parseISODate, roundDeskMoney } from "@/lib/utils";

/**
 * Whole issue ÷ the debentures the unwind ran on. computeUnwind sizes every option leg to those
 * debentures, but its grown values, like the payout at maturity, are always the whole issue, so
 * option cash is multiplied by this before the two are added. 1 on the Product Book, which runs on
 * the whole issue; 5 on the Unwinding Calculator typed with 800 of 4,000 debentures.
 */
export function optionCashToWholeIssue(result: Pick<UnwindResult, "debentures" | "totalDebs">): number {
  const { debentures, totalDebs } = result;
  if (!(debentures > 0) || !(totalDebs > 0) || debentures === totalDebs) return 1;
  return totalDebs / debentures;
}

/**
 * Workbook List of Products AZ (Grown Outflow), summed over the product:
 *   AZ = IF(Expiry < Valuation, AY × Premium Discounting Rate × (Valuation − Expiry) ÷ 365, 0)
 * AY is the settled option cash (intrinsic × signed quantity), so this is simple interest on a
 * payout from its expiry to the valuation date. Unwinding has no such term, so it stays out of
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
    if (days > 0) carry += (row.premiumOutflowRs * product.premDiscRate * days) / 365;
  }
  return roundDeskMoney(carry);
}

type BookValue = {
  /** Σ AZ for the whole issue: carry on settled option cash from each expiry to the valuation date. */
  settledCarryRs: number;
  /**
   * Workbook BH Exit Value (F + H + J + K), whole issue: Unwinding's Unwind Value plus the AZ carry,
   * with the option cash taken to the whole issue when the unwind ran on fewer debentures.
   */
  exitValueRs: number;
  /** Workbook L Unwind Price: Exit Value ÷ Total Debentures, per debenture. */
  bookQuoteRs: number;
};

/** The Active Management book figures (workbook K, L, BH) off one unwind. */
export function bookValue(
  product: Pick<ProductMaster, "premDiscRate">,
  result: Pick<UnwindResult, "optionRows" | "unwindDate" | "masterEconomics" | "totalDebs" | "debentures">,
): BookValue {
  // Unwind Value adds whole-issue grown values to option cash at the unwind's debentures.
  const scale = optionCashToWholeIssue(result);
  const settledCarryRs = roundDeskMoney(settledOutflowCarryRs(product, result) * scale);
  const exitValueRs = roundDeskMoney(
    result.masterEconomics.unwindValueRs + (scale - 1) * result.masterEconomics.premiumOutflowRs + settledCarryRs,
  );
  const debentures = result.totalDebs;
  const bookQuoteRs = Number.isFinite(debentures) && debentures > 0 ? roundDeskMoney(exitValueRs / debentures) : 0;
  return { settledCarryRs, exitValueRs, bookQuoteRs };
}
