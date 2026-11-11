import { lookupFwdSellRate } from "@/lib/engine/vol-surface";
import { postObservationFigures } from "@/lib/multi/post-observation";
import type { ProductMaster, UnwindResult, VolSurface } from "@/lib/types";
import { daysBetween, parseISODate, roundDeskMoney } from "@/lib/utils";

/**
 * Expected Difference at Maturity, in rupees for the whole issue: what the book is expected to
 * hold on the maturity date, less the payout due then. Built only from one unwind's economics
 * and its option rows, at mid marks (no Bid Ask spread: the desk is not trading the options away).
 *
 *   g(r, d)      = (1 + r)^(d ÷ 365);  T = valuation + Residual Tenor (the maturity date)
 *   Margin Now   = Total Funds For Margin × g(Margin Funding Rate, Invested Tenor)
 *   NBFC Now     = Grown Value − Margin Now
 *   Assets At T  = NBFC Now × g(Product Discounting Rate, Residual Tenor)
 *                + Margin Now × g(Margin Funding Rate, Residual Tenor)
 *                + Premium Grown Value × g(Premium Discounting Rate, Residual Tenor)
 *   Settled At T = Σ expired legs: settled cash × g(Premium Discounting Rate, T − expiry)
 *   Open At T    = Σ live legs: mid cash × e^(q × τ) × g(Premium Discounting Rate, T − expiry),
 *                  q = Forward Sell Rate(expiry) + 1%, τ = years from valuation to expiry
 *   Difference   = Assets At T + Settled At T + Open At T − Face Value × (1 + Coupon) × Debentures
 *
 * Why each term and rate:
 * - Each part of the NBFC book keeps growing at the rate Unwinding already grows it at from
 *   allotment: Amount with NBFC at the Product Discounting Rate, margin funds at the Margin Funding
 *   Rate, credited premium at the Premium Discounting Rate. Grown Value holds the first two, so the
 *   margin part is taken out with Unwinding's own formula. Together they reach allotment + tenor.
 * - Option cash is a draw on, or an addition to, the premium account, so from the day it is paid
 *   it grows at the Premium Discounting Rate, compounding like the premium itself. The workbook
 *   accrues settled payouts at that rate too (List of Products AZ).
 * - A settled leg's cash was paid at its expiry: carried from expiry to maturity.
 * - A live leg's mid mark is a present value: Black–Scholes discounts the expected payoff at the
 *   Forward Sell Rate + 1% (the pricer's discount yield), so e^(q × τ) restores the payoff expected
 *   at expiry, which is then carried to maturity. Mid, not the side mark, since nothing is unwound.
 * - The headline quote's Margin Cost × Residual ÷ Tenor term refunds margin cost not yet earned on
 *   an early exit. At maturity nothing is unearned, so it has no term here.
 * - The payout is Post Observation's Expected Amount, with its rounding.
 *
 * The NBFC part grows to about the payout by construction, so the figure is mostly the option
 * book's expected cash at maturity: negative when the sold puts are expected to pay out.
 *
 * Sign: positive means the book is worth more than the payout, the same way round as Post
 * Observation's Difference (Unwind Amount − Expected Amount), which compares a value today with a
 * payout at maturity instead. At an expected level, the live legs' mids come from the unwind at
 * that level. Option cash is at the debentures the unwind ran on; the Product Book runs at the
 * issued count, so it is the whole issue. Null when mobilization or face value is not positive,
 * or a figure is not finite.
 */
export function expectedDifferenceAtMaturity(
  product: ProductMaster,
  result: Pick<UnwindResult, "masterEconomics" | "investedTenorDays" | "residualTenor" | "optionRows" | "unwindDate">,
  surface: VolSurface,
): number | null {
  if (!(product.mobilization > 0) || !(product.faceValue > 0)) return null;
  const g = (rate: number, days: number) => Math.pow(1 + rate, days / 365);
  const invested = Math.max(result.investedTenorDays, 0);
  const residual = Math.max(result.residualTenor, 0);
  const valuation = parseISODate(result.unwindDate);
  const maturity = new Date(valuation.getTime() + residual * 86_400_000);
  const e = result.masterEconomics;

  const marginNow = product.totalFundsForMargin * g(product.marginFundingRate, invested);
  const nbfcNow = e.grownValueRs - marginNow;
  const assetsAtMaturity =
    nbfcNow * g(product.prdDiscRate, residual) +
    marginNow * g(product.marginFundingRate, residual) +
    e.premGrownValueRs * g(product.premDiscRate, residual);

  let optionCashAtMaturity = 0;
  for (const row of result.optionRows) {
    const expiry = parseISODate(row.expiry);
    const carry = g(product.premDiscRate, daysBetween(expiry, maturity));
    if (row.expired) {
      optionCashAtMaturity += row.premiumOutflowRs * carry;
      continue;
    }
    // The z = 0 Options Book cash: currentPrice is the mid (null when it rounds to 0.00).
    const midCash = roundDeskMoney((row.currentPrice ?? 0) * row.quantity);
    const tau = daysBetween(valuation, expiry) / 365;
    const q = lookupFwdSellRate(surface.pricingParams, expiry) + 0.01;
    optionCashAtMaturity += midCash * Math.exp(q * tau) * carry;
  }

  const difference = assetsAtMaturity + optionCashAtMaturity - postObservationFigures(product, null).expectedAmount;
  return Number.isFinite(difference) ? roundDeskMoney(difference) : null;
}
