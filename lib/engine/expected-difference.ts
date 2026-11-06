import { grow } from "@/lib/engine/rates";

type ExpectedDifferenceInput = {
  /** Net mobilisation, premium and margin already grown from allotment to valuation (rupees). */
  grownMobilisation: number;
  grownPremium: number;
  grownMargin: number;
  prodRate: number;
  premRate: number;
  marginRate: number;
  /** Valuation to maturity. */
  residualDays: number;
  /** Open option legs marked at valuation, as money owed by the book (rupees; zero when no open legs). */
  remainingOutflow: number;
  /** Face Value x (1 + Coupon) x Debentures. */
  contractualTerminal: number;
};

export type ExpectedDifference = {
  grownMobilisationAtMaturity: number;
  grownPremiumAtMaturity: number;
  grownMarginAtMaturity: number;
  interestOnlyBookAtMaturity: number;
  remainingOutflowAtMaturity: number;
  contractualTerminal: number;
  difference: number;
};

/**
 * If the residual tenure only earns interest, what is left over at maturity once the contractual redemption and the
 * still-open option outflow are paid. Close to zero for a product with no open legs; a large value points at the
 * master rates, costs or coupon.
 */
export function expectedDifferenceAtMaturity(input: ExpectedDifferenceInput): ExpectedDifference {
  const days = Math.max(0, input.residualDays);
  const grownMobilisationAtMaturity = grow(input.grownMobilisation, input.prodRate, days);
  const grownPremiumAtMaturity = grow(input.grownPremium, input.premRate, days);
  const grownMarginAtMaturity = grow(input.grownMargin, input.marginRate, days);
  const interestOnlyBookAtMaturity = grownMobilisationAtMaturity + grownPremiumAtMaturity + grownMarginAtMaturity;
  const remainingOutflowAtMaturity = grow(input.remainingOutflow, input.premRate, days);
  return {
    grownMobilisationAtMaturity,
    grownPremiumAtMaturity,
    grownMarginAtMaturity,
    interestOnlyBookAtMaturity,
    remainingOutflowAtMaturity,
    contractualTerminal: input.contractualTerminal,
    difference: interestOnlyBookAtMaturity - input.contractualTerminal - remainingOutflowAtMaturity,
  };
}

/** Within half a percent of mobilisation reads as zero; above five percent is a red flag. */
export function expectedDifferenceTone(difference: number | null, mobilisation: number | null): "neutral" | "green" | "amber" | "red" {
  if (difference == null || !mobilisation) return "neutral";
  const share = Math.abs(difference) / mobilisation;
  if (share <= 0.005) return "green";
  if (share <= 0.05) return "amber";
  return "red";
}
