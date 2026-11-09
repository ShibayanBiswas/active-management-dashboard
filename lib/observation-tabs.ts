import type { ProductMaster } from "@/lib/types";
import { deskTodayISO, parseISODate } from "@/lib/utils";

export const OBSERVATION_TAB_ORDER = [
  { id: "ongoing", label: "Ongoing" },
  { id: "obs-3m", label: "Observation in 3 Month" },
  { id: "obs-2m", label: "Observation in 2 Month" },
  { id: "obs-1m", label: "Observation in 1 Month" },
  { id: "expired", label: "Expired" },
] as const;

export type ObservationTabId = (typeof OBSERVATION_TAB_ORDER)[number]["id"];

/** Product Book / Unwinding / Pricer — live maturity only (no Expired tab). */
export const LIVE_OBSERVATION_TAB_ORDER = OBSERVATION_TAB_ORDER.filter((tab) => tab.id !== "expired");

function expiryDay(value: string): string {
  const parsed = parseISODate(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function uniqueSortedExpiryDays(expiries: string[]): string[] {
  return [...new Set(expiries.map(expiryDay).filter(Boolean))].sort();
}

/**
 * Product has not passed Maturity Date yet (Maturity Date ≥ Asia/Kolkata as-of day).
 * Blank / invalid maturity is treated as not ongoing.
 */
export function productHasLiveMaturity(
  product: ProductMaster,
  asOf: string = deskTodayISO(),
): boolean {
  const maturity = expiryDay(product.maturityDate);
  if (!maturity) return false;
  return maturity >= asOf.slice(0, 10);
}

/** Desk lists (Product Book, Unwinding, Pricer, Desk Book tabs) use only live-maturity products. */
export function productsWithLiveMaturity(
  products: ProductMaster[],
  asOf: string = deskTodayISO(),
): ProductMaster[] {
  return products.filter((product) => productHasLiveMaturity(product, asOf));
}

/**
 * Remaining unique Option Expiry Dates on or after as-of, nearest first.
 * Empty when every option expiry has passed (product may still be live on maturity).
 */
export function remainingObservationDays(
  product: ProductMaster,
  asOf: string = deskTodayISO(),
): string[] {
  const asOfDay = asOf.slice(0, 10);
  const all = uniqueSortedExpiryDays(product.legs.map((leg) => leg.expiry));
  // An option expiring on the as-of day is already settled at intrinsic, so it is not remaining.
  return all.filter((day) => day > asOfDay);
}

/**
 * Next four unique remaining Option Expiry Dates.
 * Index 0 = Ongoing (nearest remaining), 1 = Observation in 1 Month,
 * 2 = Observation in 2 Month, 3 = Observation in 3 Month.
 * Labels match Primary SP; the dates are computed from as-of, not calendar-month distance.
 * This book’s next expiries sit years out, so calendar-month filters would empty the 2/3 Month tabs.
 */
export function observationDatesForProduct(
  product: ProductMaster,
  asOf: string = deskTodayISO(),
): [string | null, string | null, string | null, string | null] {
  const pool = remainingObservationDays(product, asOf);
  return [pool[0] ?? null, pool[1] ?? null, pool[2] ?? null, pool[3] ?? null];
}

export function expiryForObservationTab(
  dates: [string | null, string | null, string | null, string | null],
  tab: ObservationTabId,
): string | null {
  switch (tab) {
    case "ongoing":
      return dates[0];
    case "obs-1m":
      return dates[1];
    case "obs-2m":
      return dates[2];
    case "obs-3m":
      return dates[3];
    case "expired":
      return null;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

/**
 * Observation-tab membership.
 * Expired = Maturity Date before as-of (past products).
 * Every live tab requires Maturity Date ≥ as-of.
 * Ongoing = live maturity (full product / all option rows stay on the book).
 * Observation in 1 / 2 / 3 Month = live maturity and a 2nd / 3rd / 4th remaining option expiry.
 */
export function productHasObservationTab(
  product: ProductMaster,
  tab: ObservationTabId,
  asOf?: string,
): boolean {
  const day = asOf ?? deskTodayISO();
  if (tab === "expired") return !productHasLiveMaturity(product, day);
  if (!productHasLiveMaturity(product, day)) return false;
  if (tab === "ongoing") return true;
  return expiryForObservationTab(observationDatesForProduct(product, day), tab) != null;
}

/** Products that have this observation. Every option row stays on the book. */
export function productsForObservationTab(
  products: ProductMaster[],
  tab: ObservationTabId,
  asOf?: string,
): ProductMaster[] {
  return products.filter((product) => productHasObservationTab(product, tab, asOf));
}
