/** amount x (1 + rate) ^ (days / 365). */
export function grow(amount: number, rate: number, days: number): number {
  return amount * Math.pow(1 + rate, days / 365);
}

/** Annualised rate taking pv to fv over n years: (fv / pv) ^ (1 / n) - 1. Null when undefined. */
export function rateZeroCoupon(years: number, pv: number, fv: number): number | null {
  if (!(years > 0) || !(pv > 0) || !(fv > 0)) return null;
  const r = Math.pow(fv / pv, 1 / years) - 1;
  return Number.isFinite(r) ? r : null;
}
