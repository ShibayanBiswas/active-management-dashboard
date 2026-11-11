import { computeUnwind } from "@/lib/engine/unwind";
import type { ProductMaster, UnderlyingIndex, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import { deskPricingSpot, roundDeskMoney, underlyingFromProductName } from "@/lib/utils";
import { bookValue } from "@/lib/active-management/book-value";
import { irrSet, type IrrSet } from "@/lib/active-management/irr";
import { expectedDifferenceAtMaturity } from "@/lib/active-management/maturity";

export const SCENARIO_STEP = 100;
export const SCENARIO_STEPS_EACH_SIDE = 10;

function underlyingOf(product: ProductMaster, inputs: UnwindInputs): UnderlyingIndex {
  return inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
    ? inputs.underlying
    : underlyingFromProductName(product.productName, product.productCode);
}

/**
 * Inputs for the same unwind with only the Black–Scholes spot moved.
 * deskPricingSpot prefers inputs.sensex (Sensex) or inputs.nifty (Nifty) over inputs.spot,
 * so the matching index field must move too, or the shift is silently ignored.
 * expirySpots is mandatory: without it, expired legs settle at the scenario spot.
 */
export function inputsAtLevel(product: ProductMaster, base: UnwindInputs, level: number): UnwindInputs {
  if (!base.expirySpots) {
    throw new Error("Scenario needs the expiry closes map (pass {} when no leg has expired)");
  }
  const underlying = underlyingOf(product, base);
  return underlying === "Sensex"
    ? { ...base, underlying, spot: level, sensex: level }
    : { ...base, underlying, spot: level, nifty: level };
}

/** The exact Unwinding unwind at another index level: same surface, date, debentures, spread and fixings. */
export function unwindAtLevel(args: {
  product: ProductMaster;
  surface: VolSurface;
  base: UnwindInputs;
  level: number;
}): UnwindResult {
  return computeUnwind({
    product: args.product,
    surface: args.surface,
    inputs: inputsAtLevel(args.product, args.base, args.level),
  });
}

/**
 * Expected IRR: the workbook's "IRR at assumed level" as a full unwind at that index level
 * (not the workbook's delta shortcut), on the book quote and capped at Max IRR like Current IRR.
 * The same unwind gives the Exit Value at that level (workbook BJ, with the AZ carry) and the
 * Expected Difference at Maturity with the live legs repriced at that level.
 */
export function expectedIrrAtLevel(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  level: number;
}): {
  level: number;
  unwindQuoteRs: number;
  irr: IrrSet;
  expectedIrr: number | null;
  exitValueRs: number;
  expectedDifferenceRs: number | null;
} {
  const r = unwindAtLevel({ product: args.product, surface: args.surface, base: args.inputs, level: args.level });
  const irr = irrSet(r, args.product);
  return {
    level: args.level,
    unwindQuoteRs: r.unwindQuoteRs,
    irr,
    expectedIrr: irr.currentIrr,
    exitValueRs: bookValue(args.product, r).exitValueRs,
    expectedDifferenceRs: expectedDifferenceAtMaturity(args.product, r, args.surface),
  };
}

/** S0 + k × step for k = −steps … +steps (21 levels by default). S0 is not rounded. */
export function scenarioLevels(baseSpot: number, step = SCENARIO_STEP, steps = SCENARIO_STEPS_EACH_SIDE): number[] {
  const out: number[] = [];
  for (let k = -steps; k <= steps; k += 1) out.push(baseSpot + k * step);
  return out;
}

export type ScenarioCell = {
  k: number;
  shift: number;
  level: number;
  unwindQuoteRs: number;
  unwindQuotePct: number;
  bookUnwindPerDebentureRs: number;
  premiumOutflowRs: number;
  /** Unwinding's Unwind Value (masterEconomics), whole issue. */
  unwindValueRs: number;
  /** Active Management Exit Value: Unwind Value plus the AZ carry on settled cash (book-value.ts). */
  exitValueRs: number;
  /** Current IRR here is on the book quote, Exit Value ÷ debentures (irr.ts). */
  irr: IrrSet;
  /** Expected Difference at Maturity at this level (maturity.ts), whole issue. */
  expectedDifferenceRs: number | null;
  /** This level minus the base level (k = 0). Rupees to the paisa. */
  change: {
    unwindQuoteRs: number;
    unwindQuotePct: number;
    premiumOutflowRs: number;
    unwindValueRs: number;
    exitValueRs: number;
    clientIRR: number;
    residualIRR: number;
    currentIrr: number | null;
    expectedDifferenceRs: number | null;
  };
};

export type ScenarioGrid = {
  underlying: UnderlyingIndex;
  unwindDate: string;
  baseSpot: number;
  step: number;
  cells: ScenarioCell[];
  base: ScenarioCell;
  liveLegs: number;
  expiredLegs: number;
  /** No live leg: every level equals the base, so the ladder is flat by construction. */
  flat: boolean;
};

function cellOf(
  k: number,
  step: number,
  level: number,
  r: UnwindResult,
  product: ProductMaster,
  surface: VolSurface,
): Omit<ScenarioCell, "change"> {
  return {
    k,
    shift: k * step,
    level,
    unwindQuoteRs: r.unwindQuoteRs,
    unwindQuotePct: r.unwindQuotePct,
    bookUnwindPerDebentureRs: r.masterEconomics.unwindQuoteRs,
    premiumOutflowRs: r.masterEconomics.premiumOutflowRs,
    unwindValueRs: r.masterEconomics.unwindValueRs,
    exitValueRs: bookValue(product, r).exitValueRs,
    irr: irrSet(r, product),
    expectedDifferenceRs: expectedDifferenceAtMaturity(product, r, surface),
  };
}

/** One cell less the base cell (k = 0): rupees to the paisa, rates unrounded, null when either side is blank. */
export function scenarioChange(c: Omit<ScenarioCell, "change">, b: Omit<ScenarioCell, "change">): ScenarioCell["change"] {
  const diff = (a: number | null, z: number | null) => (a == null || z == null ? null : a - z);
  const rupees = (a: number | null, z: number | null) => (a == null || z == null ? null : roundDeskMoney(a - z));
  return {
    unwindQuoteRs: roundDeskMoney(c.unwindQuoteRs - b.unwindQuoteRs),
    unwindQuotePct: c.unwindQuotePct - b.unwindQuotePct,
    premiumOutflowRs: roundDeskMoney(c.premiumOutflowRs - b.premiumOutflowRs),
    unwindValueRs: roundDeskMoney(c.unwindValueRs - b.unwindValueRs),
    exitValueRs: roundDeskMoney(c.exitValueRs - b.exitValueRs),
    clientIRR: c.irr.clientIRR - b.irr.clientIRR,
    residualIRR: c.irr.residualIRR - b.irr.residualIRR,
    currentIrr: diff(c.irr.currentIrr, b.irr.currentIrr),
    expectedDifferenceRs: rupees(c.expectedDifferenceRs, b.expectedDifferenceRs),
  };
}

/**
 * Per-product ladder. Pass the base result already on screen (k = 0 reuses it, so the
 * grid's centre equals the Unwinding output exactly) or let the grid compute it.
 */
export function scenarioGrid(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  baseResult?: UnwindResult;
  step?: number;
  steps?: number;
}): ScenarioGrid {
  const { product, surface, inputs } = args;
  const step = args.step ?? SCENARIO_STEP;
  const steps = args.steps ?? SCENARIO_STEPS_EACH_SIDE;
  const underlying = underlyingOf(product, inputs);
  const baseSpot = deskPricingSpot({ ...inputs, underlying }) ?? inputs.spot;
  if (!(baseSpot > 0)) throw new Error("Scenario needs a positive desk spot");
  const base = args.baseResult ?? unwindAtLevel({ product, surface, base: inputs, level: baseSpot });
  const liveLegs = base.optionRows.filter((row) => !row.expired).length;
  const flat = liveLegs === 0;
  const levels = scenarioLevels(baseSpot, step, steps);
  const raw = levels.map((level, i) => {
    const k = i - steps;
    const r = k === 0 || flat ? base : unwindAtLevel({ product, surface, base: inputs, level });
    return cellOf(k, step, level, r, product, surface);
  });
  const b = raw[steps]!;
  const cells: ScenarioCell[] = raw.map((c) => ({ ...c, change: scenarioChange(c, b) }));
  return {
    underlying,
    unwindDate: inputs.unwindDate,
    baseSpot,
    step,
    cells,
    base: cells[steps]!,
    liveLegs,
    expiredLegs: base.optionRows.length - liveLegs,
    flat,
  };
}
