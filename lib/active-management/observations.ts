import { productObservationYmds } from "@/lib/multi/observation-date-filter";
import type { ProductMaster, UnderlyingIndex } from "@/lib/types";
import { deskTodayISO, underlyingFromProductName } from "@/lib/utils";

export type ObservationStatus = "No Observations" | "Not Started" | "Observations Live" | "Observations Done";

export type ObservationPoint = {
  /** YYYY-MM-DD, a unique Option Expiry Date on the product. */
  date: string;
  /** On or before the as-of day. An expiry ON the as-of day is already settled (Unwinding rule). */
  passed: boolean;
  /** Index close on/before the date (Yahoo, same map computeUnwind settles expired legs with). Null when not passed or missing. */
  fixing: number | null;
  /** Passed on today's desk date: Yahoo returns the prior session close until 15:30 IST. */
  provisional: boolean;
};

export type ObservationFacts = {
  underlying: UnderlyingIndex;
  points: ObservationPoint[];
  total: number;
  passed: number;
  left: number;
  startDate: string | null;
  endDate: string | null;
  lastPassedDate: string | null;
  nextDate: string | null;
  /** Sum of the passed fixings. Null while any passed fixing is missing. */
  sumFixings: number | null;
  averageSoFar: number | null;
  missingFixings: string[];
  status: ObservationStatus;
};

/**
 * Observation facts at the desk date. Dates are Unwinding's observation dates
 * (unique Option Expiry Dates, productObservationYmds). Passed uses the same rule as
 * collectExpiredLegExpiryDates / remainingObservationDays: date <= asOf.
 */
export function observationFacts(
  product: ProductMaster,
  asOf: string,
  fixings?: Record<string, number>,
  today: string = deskTodayISO(),
): ObservationFacts {
  const day = asOf.slice(0, 10);
  const dates = productObservationYmds(product);
  const points: ObservationPoint[] = dates.map((date) => {
    const passed = date <= day;
    const close = passed ? fixings?.[date] : undefined;
    return {
      date,
      passed,
      fixing: close != null && close > 0 ? close : null,
      provisional: passed && date === today,
    };
  });
  const passedPoints = points.filter((p) => p.passed);
  const missingFixings = passedPoints.filter((p) => p.fixing == null).map((p) => p.date);
  const total = points.length;
  const passed = passedPoints.length;
  const left = total - passed;
  const sumFixings =
    missingFixings.length === 0 ? passedPoints.reduce((s, p) => s + (p.fixing ?? 0), 0) : null;
  const status: ObservationStatus =
    total === 0 ? "No Observations" : passed === 0 ? "Not Started" : left === 0 ? "Observations Done" : "Observations Live";
  return {
    underlying: underlyingFromProductName(product.productName, product.productCode),
    points,
    total,
    passed,
    left,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    lastPassedDate: passedPoints[passedPoints.length - 1]?.date ?? null,
    nextDate: points.find((p) => !p.passed)?.date ?? null,
    sumFixings,
    averageSoFar: passed > 0 && sumFixings != null ? sumFixings / passed : null,
    missingFixings,
    status,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Workbook Calculator!BI "Pending Obs": each upcoming observation date as MMM-YY, one per date.
 * "Jul-26", "Jul-26, Oct-26", "Nov-26, Dec-26 & Jan-27", "Nov-26, Dec-26, Jan-27 & Feb-27".
 * Fixes the workbook's bugs (spec §8, B5): null instead of "," or #VALUE! when nothing is pending,
 * no "Jan-00" for passed dates, three dates work, and a comma after the first date.
 */
export function pendingObservationsText(dates: string[]): string | null {
  const labels = dates.map((date) => `${MONTHS[Number(date.slice(5, 7)) - 1] ?? "-"}-${date.slice(2, 4)}`);
  if (!labels.length) return null;
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export type ObservationProgressTab = "none-passed" | "some-passed";

export const OBSERVATION_PROGRESS_TABS = [
  { id: "none-passed", label: "No Observation Passed" },
  { id: "some-passed", label: "At Least One Observation Passed" },
] as const;

/** No date needed beyond as-of, so it filters 2,000+ products without fixings or quotes. */
export function productHasProgressTab(product: ProductMaster, tab: ObservationProgressTab, asOf: string): boolean {
  const day = asOf.slice(0, 10);
  const anyPassed = productObservationYmds(product).some((date) => date <= day);
  return tab === "some-passed" ? anyPassed : !anyPassed;
}
