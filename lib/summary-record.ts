import type { BookRow } from "@/lib/engine/book";
import { toCrore } from "@/lib/format";

/** One Book Summary line as plain values: the API response and the export rows share it. */
export function summaryRecord(row: BookRow) {
  const { product, lifecycle, unwind, assumed } = row;
  return {
    id: product.id,
    product: product.name,
    status: lifecycle.status,
    pendingObservations: lifecycle.pending,
    pendingMonths: lifecycle.pendingMonths,
    actualTarget: product.actualTarget,
    residualTarget: row.residualTarget,
    maxIrr: unwind.maxIrr,
    currentIrr: unwind.current.cappedIrr,
    assumedIrr: assumed.cappedIrr,
    mobilisationCrore: toCrore(product.mobilisation),
    exitValueCurrentCrore: toCrore(unwind.current.exitValue),
    exitValueAssumedCrore: toCrore(assumed.exitValue),
    expectedDifference: unwind.expected?.difference ?? null,
    expectedDifferenceCrore: toCrore(unwind.expected?.difference ?? null),
    warnings: unwind.warnings,
  };
}
