import type { OptionLeg } from "@/lib/types";

/** One live hedge slot: type, side, strike, expiry (calendar day). */
export function optionLegPositionKey(
  leg: Pick<OptionLeg, "optionType" | "originalSide" | "strike" | "expiry">,
): string {
  return `${String(leg.optionType).trim()}|${String(leg.originalSide).trim()}|${Number(leg.strike)}|${String(leg.expiry).slice(0, 10)}`;
}

function finiteKey(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * Exact clone of a live row. Repeated strikes stay when the price, the spread,
 * or the quantity differs. An identical paste of the same row is dropped once.
 */
export function optionLegCloneKey(
  leg: Pick<OptionLeg, "optionType" | "originalSide" | "strike" | "expiry" | "spreads" | "reqQuantity" | "prdPrice">,
): string {
  return [
    optionLegPositionKey(leg),
    finiteKey(leg.spreads),
    finiteKey(leg.reqQuantity),
    finiteKey(leg.prdPrice),
  ].join("|");
}

/**
 * Main Master books sometimes paste the same option block twice (e.g. product 1684).
 * Drop that exact clone. Keep a repeated strike when its price, spread, or quantity differs,
 * the way the Unwinding Master lists it.
 */
export function dedupeOptionLegs(legs: OptionLeg[]): OptionLeg[] {
  const seen = new Set<string>();
  const out: OptionLeg[] = [];
  for (const leg of legs) {
    const key = optionLegCloneKey(leg);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(leg);
  }
  return out;
}
