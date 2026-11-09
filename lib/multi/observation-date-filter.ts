import type { ProductMaster } from "@/lib/types";

export const OBSERVATION_DATE_MODES = ["first", "last", "any"] as const;

export type ObservationDateMode = (typeof OBSERVATION_DATE_MODES)[number];

export const OBSERVATION_DATE_MODE_LABELS: Record<ObservationDateMode, string> = {
  first: "First Observation",
  last: "Last Observation",
  any: "Any Observation",
};

export function parseObservationDateMode(value: string): ObservationDateMode {
  switch (value) {
    case "first":
    case "last":
    case "any":
      return value;
    default:
      return "any";
  }
}

/** Unique option expiry dates on the product, earliest first. These are the observation dates. */
export function productObservationYmds(product: ProductMaster): string[] {
  const days = new Set<string>();
  for (const leg of product.legs ?? []) {
    const day = String(leg.expiry ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  }
  return [...days].sort();
}

export function oldestAllotmentYmd(products: ProductMaster[], fallback: string): string {
  let oldest = "";
  for (const product of products) {
    const day = String(product.allotmentDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!oldest || day < oldest) oldest = day;
  }
  return oldest || fallback;
}

/** Earliest option expiry on the ongoing book. That is the Observation Date start. */
export function oldestObservationYmd(products: ProductMaster[], fallback: string): string {
  let oldest = "";
  for (const product of products) {
    for (const day of productObservationYmds(product)) {
      if (!oldest || day < oldest) oldest = day;
    }
  }
  return oldest || fallback;
}

function inRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/**
 * First = earliest option expiry falls in the window.
 * Last = latest option expiry falls in the window.
 * Any = at least one option expiry falls in the window.
 */
export function productMatchesObservationRange(
  product: ProductMaster,
  mode: ObservationDateMode,
  start: string,
  end: string,
): boolean {
  if (!start || !end || start > end) return false;
  const dates = productObservationYmds(product);
  if (!dates.length) return false;
  switch (mode) {
    case "first":
      return inRange(dates[0]!, start, end);
    case "last":
      return inRange(dates[dates.length - 1]!, start, end);
    case "any":
      return dates.some((day) => inRange(day, start, end));
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
