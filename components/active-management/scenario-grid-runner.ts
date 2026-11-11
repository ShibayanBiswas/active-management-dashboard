import type { UnwindBasis } from "@/components/active-management/am-table";
import {
  inputsAtLevel,
  scenarioChange,
  scenarioGrid,
  scenarioLevels,
  type ScenarioCell,
  type ScenarioGrid,
} from "@/lib/active-management/scenario";
import type { ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";

/**
 * The same grid as scenarioGrid, priced one level at a time with a yield to the browser between
 * levels, so a heavy product (about 0.5 to 0.8 s in all) never blocks input. Each level is
 * scenarioGrid with no steps at that level: the same unwind and the same cell fields as the full
 * grid. Returns null when cancelled.
 */
async function scenarioGridInSteps(args: {
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
  const cells: ScenarioCell[] = raw.map((c, i) => ({
    ...c,
    k: i - steps,
    shift: (i - steps) * centre.step,
    level: levels[i]!,
    change: scenarioChange(c, b),
  }));
  return { ...centre, cells, base: cells[steps]! };
}

/** One grid per unwind on screen: reopening the tab or downloading on the same unwind does not reprice. */
const grids = new WeakMap<UnwindBasis, ScenarioGrid>();

export function cachedScenarioGrid(basis: UnwindBasis): ScenarioGrid | null {
  return grids.get(basis) ?? null;
}

/** The grid for the unwind on screen, from the cache or priced level by level and then cached. */
export async function scenarioGridFor(
  basis: UnwindBasis,
  options: { onLevel?: (done: number, total: number) => void; cancelled?: () => boolean } = {},
): Promise<ScenarioGrid | null> {
  const hit = grids.get(basis);
  if (hit) return hit;
  const grid = await scenarioGridInSteps({
    product: basis.product,
    surface: basis.surface,
    inputs: basis.inputs,
    baseResult: basis.result,
    ...options,
  });
  if (grid) grids.set(basis, grid);
  return grid;
}
