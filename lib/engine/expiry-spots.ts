import { fetchYahooClosesOnOrBefore } from "@/lib/market-data";
import type { ProductMaster, UnderlyingIndex } from "@/lib/types";
import { daysBetween, deskTodayISO, parseISODate } from "@/lib/utils";

/** YYYY-MM-DD from a leg expiry field. */
export function legExpiryYmd(expiry: string): string {
  return String(expiry).slice(0, 10);
}

/** Unique expiry dates for legs already past on the unwinding date. */
export function collectExpiredLegExpiryDates(
  product: ProductMaster,
  unwindDateIso: string,
): string[] {
  const unwind = parseISODate(unwindDateIso);
  const dates = new Set<string>();
  for (const leg of product.legs) {
    const expiry = parseISODate(leg.expiry);
    if (daysBetween(unwind, expiry) <= 0) {
      dates.add(legExpiryYmd(leg.expiry));
    }
  }
  return [...dates].sort();
}

const spotCache = new Map<string, number | null>();

function cacheKey(underlying: UnderlyingIndex, isoDate: string): string {
  return `${underlying}|${isoDate}`;
}

/**
 * Index close on/before `isoDate` for the chosen underlying.
 * Results are cached for the process lifetime (audit scripts, API batching).
 */
function yahooSymbol(underlying: UnderlyingIndex): string {
  return underlying === "Sensex" ? "^BSESN" : "^NSEI";
}

export async function fetchUnderlyingCloseOnDate(
  isoDate: string,
  underlying: UnderlyingIndex,
): Promise<number | null> {
  const key = cacheKey(underlying, isoDate);
  if (spotCache.has(key)) return spotCache.get(key)!;
  const found = await fetchYahooClosesOnOrBefore(yahooSymbol(underlying), [isoDate]);
  const spot = found.get(isoDate.slice(0, 10)) ?? null;
  const value = spot != null && spot > 0 ? spot : null;
  // A Yahoo miss is usually transient, and today's close is not final until the session ends:
  // cache only real closes for days already behind us.
  if (value != null && isoDate.slice(0, 10) < deskTodayISO()) spotCache.set(key, value);
  return value;
}

/** Batch-fetch closes for expired legs. Missing Yahoo rows are omitted. */
export async function resolveExpirySpots(
  expiryDates: string[],
  underlying: UnderlyingIndex,
): Promise<Record<string, number>> {
  const unique = [...new Set(expiryDates.map((d) => d.slice(0, 10)))].sort();
  const spots: Record<string, number> = {};
  const missing = unique.filter((iso) => !spotCache.has(cacheKey(underlying, iso)));
  let found: Map<string, number> | null = null;
  if (missing.length) {
    found = await fetchYahooClosesOnOrBefore(yahooSymbol(underlying), missing);
    for (const iso of missing) {
      const close = found!.get(iso) ?? null;
      if (close != null && close > 0 && iso < deskTodayISO()) spotCache.set(cacheKey(underlying, iso), close);
    }
  }
  for (const iso of unique) {
    const close = spotCache.get(cacheKey(underlying, iso)) ?? found?.get(iso) ?? null;
    if (close != null && close > 0) spots[iso] = close;
  }
  return spots;
}

/**
 * Settlement spot for an expired put or call.
 * A supplied map must contain the Yahoo close on/before that expiry.
 * Today's desk spot is used only when no map was supplied (locked formula fixtures).
 */
export function spotForExpiredSellPut(
  legExpiryIso: string,
  deskSpot: number,
  expirySpots?: Record<string, number>,
): number {
  const iso = legExpiryIso.slice(0, 10);
  const historical = expirySpots?.[iso];
  if (historical != null && historical > 0) return historical;
  if (expirySpots) {
    throw new Error(
      `Yahoo expiry spot missing for ${iso} — an expired option cannot be marked with today's index`,
    );
  }
  return deskSpot;
}

/** Clear in-process cache (tests). */
export function clearExpirySpotCache(): void {
  spotCache.clear();
}
