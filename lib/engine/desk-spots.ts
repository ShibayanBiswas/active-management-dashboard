import {
  fetchIndexAtDate,
  fetchLiveMarketLevels,
} from "@/lib/market-data";
import { deskTodayISO } from "@/lib/utils";

export type DeskSpots = {
  /** Calendar valuation date requested (YYYY-MM-DD, IST). */
  asOf: string;
  nifty: number;
  sensex: number;
  source: string;
  priceAsOfDate: string | null;
};

/**
 * Desk Nifty + Sensex for a valuation date — always Yahoo Finance.
 * - Today (IST): completed-session desk close rule (never an open-session print).
 * - Any other date: historical close on/before that calendar day.
 * Throws if either index is missing so callers never fall back to a hardcoded level.
 */
export async function resolveDeskSpots(isoDate: string): Promise<DeskSpots> {
  const asOf = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`resolveDeskSpots: invalid date ${isoDate}`);
  }

  const today = deskTodayISO();
  if (asOf === today) {
    const live = await fetchLiveMarketLevels();
    if (!(live.niftyLevel != null && live.niftyLevel > 0 && live.sensexLevel != null && live.sensexLevel > 0)) {
      throw new Error(
        `Yahoo desk spots unavailable for today (${asOf}): nifty=${live.niftyLevel} sensex=${live.sensexLevel}`,
      );
    }
    return {
      asOf,
      nifty: live.niftyLevel,
      sensex: live.sensexLevel,
      source: live.source,
      priceAsOfDate: live.priceAsOfDate,
    };
  }

  const hist = await fetchIndexAtDate(asOf);
  if (!(hist.niftyLevel != null && hist.niftyLevel > 0 && hist.sensexLevel != null && hist.sensexLevel > 0)) {
    throw new Error(
      `Yahoo historical spots unavailable for ${asOf}: nifty=${hist.niftyLevel} sensex=${hist.sensexLevel}`,
    );
  }
  return {
    asOf,
    nifty: hist.niftyLevel,
    sensex: hist.sensexLevel,
    source: hist.source,
    priceAsOfDate: hist.priceAsOfDate,
  };
}

/** Pricing spot for the chosen underlying from resolved Yahoo desk levels. */
export function pricingSpotFromDesk(
  underlying: "Nifty" | "Sensex",
  desk: DeskSpots,
): number {
  return underlying === "Sensex" ? desk.sensex : desk.nifty;
}
