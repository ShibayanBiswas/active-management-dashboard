import { daysBetween } from "@/lib/dates";
import type { Fixing } from "@/lib/types";

/** A fixing older than this before the requested date is treated as missing (covers a holiday week). */
const MAX_LAG_DAYS = 7;

export type FixingLookup = (date: string) => number | null;

/** Nifty close on the date, or the last close before it when the date was a holiday. */
export function fixingLookup(fixings: Fixing[]): FixingLookup {
  const sorted = [...fixings].filter((f) => f.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const dates = sorted.map((f) => f.date);
  return (date) => {
    let lo = 0;
    let hi = dates.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0 || daysBetween(dates[found], date) > MAX_LAG_DAYS) return null;
    return sorted[found].close;
  };
}
