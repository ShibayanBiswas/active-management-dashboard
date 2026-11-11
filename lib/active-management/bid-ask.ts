import seed from "@/lib/data/bid-ask-seed.json";
import type { VolSurface } from "@/lib/types";
import { parseISODate } from "@/lib/utils";

/**
 * One step of the workbook's Bid Ask sheet. through is the last expiry day in the bucket
 * (YYYY-MM-DD, inclusive); null means every later expiry. spreadPercent is s in vol percent points.
 */
export type BidAskBucket = { through: string | null; spreadPercent: number };

/** 0.75 through Mar-2027, 0.5 through Mar-2028, 0.375 through Mar-2029, 0.25 through Mar-2030, then 0.075. */
export const BID_ASK_BUCKETS: BidAskBucket[] = seed.buckets;

function expiryDay(expiry: string): string {
  const d = parseISODate(expiry);
  return Number.isNaN(d.getTime()) ? String(expiry).slice(0, 10) : d.toISOString().slice(0, 10);
}

/**
 * Bid Ask spread s for an option expiry, in vol percent points.
 * The workbook looks the expiry up by exact date, so an expiry missing from its sheet gets vol 0
 * (spec bug B10). Here the date falls in its financial-year bucket instead, so an expiry between
 * two sheet rows, or after the last one, still gets a spread.
 */
export function bidAskSpreadPercent(expiry: string): number {
  const day = expiryDay(expiry);
  const bucket = BID_ASK_BUCKETS.find((b) => b.through == null || day <= b.through);
  return (bucket ?? BID_ASK_BUCKETS[BID_ASK_BUCKETS.length - 1]!).spreadPercent;
}

/** One row per surface expiry (YYYY-MM-DD) with its spread, for the Desk Book tab. */
export function bidAskTableRows(surface: VolSurface): Array<{ expiry: string; spreadPercent: number }> {
  return surface.expiries.map((expiry) => ({ expiry: expiryDay(expiry), spreadPercent: bidAskSpreadPercent(expiry) }));
}
