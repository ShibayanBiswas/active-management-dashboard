"use client";

import { cn } from "@/lib/cn";
import { expectedDifferenceTone } from "@/lib/engine/expected-difference";
import type { ProductUnwind } from "@/lib/engine/product-unwind";
import { formatCrore, formatRupees } from "@/lib/format";

const TONE = {
  green: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-rose-700 dark:text-rose-400",
  neutral: "text-muted",
} as const;

/** Crore value coloured by size against mobilisation; the tooltip lists the grown legs, terminal and open outflow. */
export function ExpectedDifferenceCell({ unwind, mobilisation }: { unwind: ProductUnwind; mobilisation: number | null }) {
  const e = unwind.expected;
  if (!e) return <span className="text-muted">-</span>;
  const tone = expectedDifferenceTone(e.difference, mobilisation);
  const tip = [
    `Grown Mobilisation At Maturity ${formatRupees(e.grownMobilisationAtMaturity)}`,
    `Grown Premium At Maturity ${formatRupees(e.grownPremiumAtMaturity)}`,
    `Grown Margin At Maturity ${formatRupees(e.grownMarginAtMaturity)}`,
    `Interest Only Book At Maturity ${formatRupees(e.interestOnlyBookAtMaturity)}`,
    `Contractual Terminal ${formatRupees(e.contractualTerminal)}`,
    `Remaining Option Outflow At Maturity ${formatRupees(e.remainingOutflowAtMaturity)}`,
    `Expected Difference ${formatRupees(e.difference)}`,
    `Settled Expiry Payoffs To Date ${formatRupees(unwind.realisedOutflow)}`,
  ].join("\n");
  return (
    <span className={cn("font-semibold tabular-nums", TONE[tone])} title={tip}>
      {formatCrore(e.difference)}
    </span>
  );
}
