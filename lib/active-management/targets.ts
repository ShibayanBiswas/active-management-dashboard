import type { ProductMaster } from "@/lib/types";
import { liveLegsOf } from "@/lib/workbook/product-book-rows";
import type { ObservationFacts } from "@/lib/active-management/observations";

export type TargetSource = "topSellPutStrike" | "initialLevel" | "contingentLevel";

export type TargetCandidates = Record<TargetSource, number | null>;

const positive = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Candidate Actual Targets read off the Unwinding ProductMaster.
 * topSellPutStrike = highest strike among original-Sell puts (the upper digital strike).
 * It equals the workbook Calculator!AR (Primary!L) on 141 of 143 products checked.
 */
export function targetCandidates(product: ProductMaster): TargetCandidates {
  const sellPuts = liveLegsOf(product)
    .filter((leg) => /^p/i.test(String(leg.optionType).trim()) && /^s/i.test(String(leg.originalSide).trim()))
    .map((leg) => leg.strike)
    .filter((k) => Number.isFinite(k) && k > 0);
  return {
    topSellPutStrike: sellPuts.length ? Math.max(...sellPuts) : null,
    initialLevel: positive(product.initialNiftyLevel),
    contingentLevel: positive(product.contingentLevel),
  };
}

/** Desk override (uploaded Actual Target, keyed by productKey) wins; otherwise the chosen candidate. */
export function actualTarget(
  product: ProductMaster,
  source: TargetSource = "topSellPutStrike",
  override?: number | null,
): number | null {
  return positive(override) ?? targetCandidates(product)[source];
}

/**
 * Residual (Effective) Target: the average the observations still left must print
 * for the final average to equal the Actual Target.
 *   (Target × Total − Σ passed fixings) ÷ Left
 * Workbook: IFERROR((AR×AP − AN×AO) ÷ (AP − AO), "-"). Null ("-") when the target is
 * unknown, nothing is left, there are no observations, or a passed fixing is missing.
 * Before the first observation it equals the Actual Target.
 */
export function residualTarget(
  target: number | null,
  facts: Pick<ObservationFacts, "total" | "left" | "sumFixings">,
): number | null {
  if (target == null || !Number.isFinite(target)) return null;
  if (facts.total <= 0 || facts.left <= 0 || facts.sumFixings == null) return null;
  return (target * facts.total - facts.sumFixings) / facts.left;
}
