import type { ProductMaster, UnwindResult } from "@/lib/types";
import { formatDeskDateFull } from "@/lib/utils";
import { irrSet, type IrrSet } from "@/lib/active-management/irr";
import { observationFacts, type ObservationStatus } from "@/lib/active-management/observations";
import { residualTarget } from "@/lib/active-management/targets";

/** Where Actual Target came from: the New Primary master's Target Nifty, else the top original-Sell Put strike. */
export type ActualTargetSource = "Product Master" | "Top Sell Put Strike";

export type ActualTarget = { target: number | null; source: ActualTargetSource | null };

/**
 * Active Management fields for one Product Book row, priced by POST /api/multi/quotes
 * on the same unwind (date, debentures, spread, fixings) as the Unwinding quote beside it.
 */
export type ActiveManagementQuote = {
  actualTarget: number | null;
  actualTargetSource: ActualTargetSource | null;
  /** (Target × Total − Σ passed fixings) ÷ Left; null ("-") when nothing is left or a fixing is missing. */
  effectiveTarget: number | null;
  observationsTotal: number;
  observationsPassed: number;
  observationsLeft: number;
  /** YYYY-MM-DD */
  observationStartDate: string | null;
  observationEndDate: string | null;
  nextObservationDate: string | null;
  averageSoFar: number | null;
  observationStatus: ObservationStatus;
  /** (1 + Coupon)^(365 / Tenor) − 1; null when coupon or tenor is 0 (no cap). */
  maxIrr: number | null;
  /** min(Client IRR, Max IRR). */
  currentIrr: number | null;
  /** Index level Expected IRR was priced at (the assumed level, else the desk spot). */
  assumedLevel: number | null;
  expectedQuoteRs: number | null;
  /** min(Client IRR at the assumed level, Max IRR). */
  expectedIrr: number | null;
  warnings: string[];
};

/**
 * One Product Book row's Active Management fields, read off the unwind already priced for it.
 * fixings is the expiry-close map that unwind settled its expired legs with (expirySpotsUsed).
 * expected is expectedIrrAtLevel at the assumed level; null when no level is set, and then the
 * base quote at the desk spot is copied instead of pricing the same unwind twice.
 */
export function activeManagementQuote(args: {
  product: ProductMaster;
  asOf: string;
  result: Pick<UnwindResult, "spot" | "productIRR" | "clientIRR" | "residualIRR" | "investedTenorDays" | "unwindQuoteRs">;
  fixings?: Record<string, number>;
  target: ActualTarget;
  expected: { level: number; unwindQuoteRs: number; irr: IrrSet; expectedIrr: number | null } | null;
  today?: string;
}): ActiveManagementQuote {
  const { product, asOf, result, fixings, target, expected } = args;
  const facts = observationFacts(product, asOf, fixings, args.today);
  const irr = irrSet(result, product);
  const warnings: string[] = [];
  for (const day of facts.missingFixings) warnings.push(`Missing Fixing On ${formatDeskDateFull(day)}`);
  for (const point of facts.points) {
    if (point.provisional && point.fixing != null) warnings.push(`Provisional Fixing On ${formatDeskDateFull(point.date)}`);
  }
  if (irr.flags.noCap) warnings.push("No Max IRR Cap Because Coupon Or Tenor Is Zero");
  if (irr.flags.noInvestedTenor) warnings.push("Current And Expected IRR Blank Because Invested Tenor Is Zero");
  else if (irr.flags.nonPositiveQuote) warnings.push("Current IRR Blank Because Unwind Quote Is Not Positive");
  if (expected && !irr.flags.noInvestedTenor && expected.irr.flags.nonPositiveQuote) {
    warnings.push("Expected IRR Blank Because Unwind Quote Is Not Positive");
  }
  if (target.target == null) warnings.push("No Actual Target");
  else if (target.source === "Top Sell Put Strike") warnings.push("Actual Target From Top Sell Put Strike");

  return {
    actualTarget: target.target,
    actualTargetSource: target.source,
    effectiveTarget: residualTarget(target.target, facts),
    observationsTotal: facts.total,
    observationsPassed: facts.passed,
    observationsLeft: facts.left,
    observationStartDate: facts.startDate,
    observationEndDate: facts.endDate,
    nextObservationDate: facts.nextDate,
    averageSoFar: facts.averageSoFar,
    observationStatus: facts.status,
    maxIrr: irr.maxIrr,
    currentIrr: irr.currentIrr,
    assumedLevel: expected ? expected.level : result.spot > 0 ? result.spot : null,
    expectedQuoteRs: expected ? expected.unwindQuoteRs : result.unwindQuoteRs,
    expectedIrr: expected ? expected.expectedIrr : irr.currentIrr,
    warnings,
  };
}
