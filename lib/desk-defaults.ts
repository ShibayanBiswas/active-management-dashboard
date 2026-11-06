import type { AsOf, DeskInputs } from "@/lib/types";

/** Desk pricing parameters: forward 5.5%, discount forward plus 1%, delta at 6.5%. All editable on the desk. */
const DEFAULT_RATES = { forwardRate: 0.055, discountSpread: 0.01, deltaRate: 0.065 } as const;

export function defaultInputs(asOf: AsOf): DeskInputs {
  return {
    valuationDate: asOf.valuationDate,
    currentNifty: asOf.currentNifty,
    assumedNifty: asOf.assumedNifty,
    ...DEFAULT_RATES,
    scenarioMode: "delta",
  };
}
