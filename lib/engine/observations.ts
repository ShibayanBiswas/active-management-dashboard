import { monthYearLabel } from "@/lib/dates";
import type { FixingLookup } from "@/lib/engine/fixings";

export type ObservationStatus = "Observations Done" | "Observations Live" | "Not Started" | "No Observations";

export type ObservationLifecycle = {
  dates: string[];
  /** Nifty close per observation date; null while pending or when the fixing is missing. */
  fixings: (number | null)[];
  total: number;
  done: number;
  pending: number;
  averageSoFar: number | null;
  status: ObservationStatus;
  pendingDates: string[];
  /** "Jul-26, Oct-26 & Jan-27", or "-" when nothing is pending. */
  pendingMonths: string;
  /** Observation dates on or before valuation whose fixing could not be found. */
  missingFixings: string[];
};

export function joinMonths(dates: string[]): string {
  const labels = dates.map(monthYearLabel);
  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export function observationLifecycle(dates: string[], valuationDate: string, lookup: FixingLookup): ObservationLifecycle {
  const sorted = [...dates].filter(Boolean).sort();
  const fixings: (number | null)[] = [];
  const missingFixings: string[] = [];
  for (const date of sorted) {
    if (date > valuationDate) {
      fixings.push(null);
      continue;
    }
    const close = lookup(date);
    if (close == null) missingFixings.push(date);
    fixings.push(close);
  }
  const observed = fixings.filter((f): f is number => f != null);
  const total = sorted.length;
  const done = observed.length;
  const pendingDates = sorted.filter((_, i) => fixings[i] == null);
  const status: ObservationStatus =
    total === 0 ? "No Observations" : done === total ? "Observations Done" : done === 0 ? "Not Started" : "Observations Live";
  return {
    dates: sorted,
    fixings,
    total,
    done,
    pending: total - done,
    averageSoFar: done ? observed.reduce((s, v) => s + v, 0) / done : null,
    status,
    pendingDates,
    pendingMonths: joinMonths(pendingDates),
    missingFixings,
  };
}

/**
 * Average level the pending observations must print for the final average to reach the target:
 * (Target x Total - Average So Far x Done) / Pending. Null when nothing is pending or the target is unknown.
 */
export function residualTarget(target: number | null, lifecycle: Pick<ObservationLifecycle, "total" | "done" | "pending" | "averageSoFar">): number | null {
  if (target == null || !Number.isFinite(target) || lifecycle.pending <= 0) return null;
  const doneSum = lifecycle.done > 0 ? (lifecycle.averageSoFar ?? 0) * lifecycle.done : 0;
  return (target * lifecycle.total - doneSum) / lifecycle.pending;
}
