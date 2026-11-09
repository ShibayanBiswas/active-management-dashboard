import { inputsAtLevel, scenarioGrid, scenarioLevels, type ScenarioCell, type ScenarioGrid } from "@/lib/active-management/scenario";
import type { ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import { roundDeskMoney } from "@/lib/utils";

/**
 * The same grid as scenarioGrid, priced one level at a time with a yield to the browser between
 * levels, so a heavy product (about 0.5 to 0.8 s in all) never blocks input. Each level is
 * scenarioGrid with no steps at that level: the same unwind and the same cell fields as the full
 * grid. Returns null when cancelled.
 */
export async function scenarioGridInSteps(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  baseResult: UnwindResult;
  onLevel?: (done: number, total: number) => void;
  cancelled?: () => boolean;
}): Promise<ScenarioGrid | null> {
  const { product, surface, inputs, baseResult } = args;
  const centre = scenarioGrid({ product, surface, inputs, baseResult, steps: 0 });
  // No live option: every level is the base, so the full grid costs nothing.
  if (centre.flat) return scenarioGrid({ product, surface, inputs, baseResult });

  const levels = scenarioLevels(centre.baseSpot, centre.step);
  const steps = (levels.length - 1) / 2;
  const raw: ScenarioCell[] = [];
  for (let i = 0; i < levels.length; i += 1) {
    if (args.cancelled?.()) return null;
    const k = i - steps;
    raw.push(
      k === 0
        ? centre.base
        : scenarioGrid({ product, surface, inputs: inputsAtLevel(product, inputs, levels[i]!), steps: 0 }).base,
    );
    args.onLevel?.(i + 1, levels.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (args.cancelled?.()) return null;

  const b = centre.base;
  const diff = (a: number | null, c: number | null) => (a == null || c == null ? null : a - c);
  const cells: ScenarioCell[] = raw.map((c, i) => ({
    ...c,
    k: i - steps,
    shift: (i - steps) * centre.step,
    level: levels[i]!,
    change: {
      unwindQuoteRs: roundDeskMoney(c.unwindQuoteRs - b.unwindQuoteRs),
      unwindQuotePct: c.unwindQuotePct - b.unwindQuotePct,
      premiumOutflowRs: roundDeskMoney(c.premiumOutflowRs - b.premiumOutflowRs),
      unwindValueRs: roundDeskMoney(c.unwindValueRs - b.unwindValueRs),
      clientIRR: c.irr.clientIRR - b.irr.clientIRR,
      residualIRR: c.irr.residualIRR - b.irr.residualIRR,
      currentIrr: diff(c.irr.currentIrr, b.irr.currentIrr),
    },
  }));
  return { ...centre, cells, base: cells[steps]! };
}
