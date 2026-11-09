/** Standard normal cumulative distribution via Abramowitz and Stegun. */
export function normCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export type BsInput = {
  spot: number;
  strike: number;
  tauYears: number;
  forwardGrowth: number;
  discountYield: number;
  vol: number;
  isCall: boolean;
};

/**
 * Black–Scholes on forward:
 * F = S * exp(r_fwd * τ)
 * d1 = (ln(F/K) + 0.5 σ² τ) / (σ √τ)
 * d2 = d1 - σ √τ
 * Call = exp(-q τ) * (F N(d1) - K N(d2))
 * Put  = exp(-q τ) * (K N(-d2) - F N(-d1))
 * where q = discountYield.
 */
export function blackScholesPrice(input: BsInput): number {
  const { spot, strike, tauYears, forwardGrowth, discountYield, vol, isCall } = input;
  // Excel’s pricer errors when τ ≤ 0 (√τ). The desk stores that as 0, not intrinsic.
  if (tauYears <= 0) return 0;
  if (vol <= 0 || spot <= 0 || strike <= 0) return 0;

  const F = spot * Math.exp(forwardGrowth * tauYears);
  const sigSqrtT = vol * Math.sqrt(tauYears);
  const d1 = (Math.log(F / strike) + 0.5 * vol * vol * tauYears) / sigSqrtT;
  const d2 = d1 - sigSqrtT;
  const df = Math.exp(-discountYield * tauYears);

  if (isCall) {
    const call = df * (F * normCdf(d1) - strike * normCdf(d2));
    return Number.isFinite(call) ? Math.max(0, call) : 0;
  }
  const put = df * (strike * normCdf(-d2) - F * normCdf(-d1));
  return Number.isFinite(put) ? Math.max(0, put) : 0;
}

/** Finite-difference delta (spot ± 0.5). */
export function blackScholesDelta(input: BsInput, bump = 0.5): number {
  const up = blackScholesPrice({ ...input, spot: input.spot + bump });
  const dn = blackScholesPrice({ ...input, spot: input.spot - bump });
  return (up - dn) / (2 * bump);
}
