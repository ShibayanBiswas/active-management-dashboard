import { fixingLookup } from "@/lib/engine/fixings";
import { priceAtLevel, priceKey, pricingKey, type PricedKey, type PricingContext } from "@/lib/engine/leg-pricing";
import { observationLifecycle, residualTarget, type ObservationLifecycle } from "@/lib/engine/observations";
import { productUnwind, unwindAtLevel, valueLegs, type LegValue, type ProductUnwind, type UnwindAtLevel, type UnwindBase } from "@/lib/engine/product-unwind";
import type { DeskData, DeskInputs, Product, ScenarioMode } from "@/lib/types";

export type BookRow = {
  product: Product;
  lifecycle: ObservationLifecycle;
  residualTarget: number | null;
  unwind: ProductUnwind;
  assumed: UnwindAtLevel;
  legs: LegValue[];
  base: UnwindBase;
};

export type BookTotals = {
  products: number;
  mobilisation: number;
  exitValueCurrent: number;
  exitValueAssumed: number;
  expectedDifference: number;
  openOutflow: number;
  withWarnings: number;
};

export type Book = {
  ctx: PricingContext;
  keys: Map<string, PricedKey>;
  rows: BookRow[];
  totals: BookTotals;
};

function pricingContext(data: Pick<DeskData, "surface" | "bidAsk" | "chains" | "fixings">, inputs: DeskInputs): PricingContext {
  return { inputs, surface: data.surface, bidAsk: data.bidAsk, chains: data.chains, lookup: fixingLookup(data.fixings) };
}

/** Option book outflow for a product with every key revalued at one level. */
function legOutflowAt(row: Pick<BookRow, "legs">, prices: Map<string, number>): number {
  let sum = 0;
  for (const lv of row.legs) sum += (prices.get(lv.priced.key) ?? 0) * lv.leg.quantity;
  return sum;
}

export function pricesAtLevel(keys: Map<string, PricedKey>, level: number, mode: ScenarioMode, ctx: PricingContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, p] of keys) out.set(key, priceAtLevel(p, level, mode, ctx));
  return out;
}

export function computeBook(data: Pick<DeskData, "products" | "surface" | "bidAsk" | "chains" | "fixings">, inputs: DeskInputs): Book {
  const ctx = pricingContext(data, inputs);
  const keys = new Map<string, PricedKey>();
  for (const product of data.products) {
    for (const leg of product.legs) {
      const key = pricingKey(leg);
      if (!keys.has(key)) keys.set(key, priceKey(leg, ctx));
    }
  }
  const assumedPrices = pricesAtLevel(keys, inputs.assumedNifty, inputs.scenarioMode, ctx);
  const rows: BookRow[] = data.products.map((product) => {
    const legs = valueLegs(product, keys, pricingKey, inputs.valuationDate);
    const { result, base } = productUnwind(product, legs, inputs.valuationDate);
    const lifecycle = observationLifecycle(product.observationDates, inputs.valuationDate, ctx.lookup);
    if (lifecycle.missingFixings.length) result.warnings.push(`Missing Fixing For Observation ${lifecycle.missingFixings[0]}`);
    return {
      product,
      lifecycle,
      residualTarget: residualTarget(product.actualTarget, lifecycle),
      unwind: result,
      assumed: unwindAtLevel(base, legOutflowAt({ legs }, assumedPrices)),
      legs,
      base,
    };
  });
  const totals: BookTotals = {
    products: rows.length,
    mobilisation: rows.reduce((s, r) => s + (r.product.mobilisation ?? 0), 0),
    exitValueCurrent: rows.reduce((s, r) => s + (r.unwind.current.exitValue ?? 0), 0),
    exitValueAssumed: rows.reduce((s, r) => s + (r.assumed.exitValue ?? 0), 0),
    expectedDifference: rows.reduce((s, r) => s + (r.unwind.expected?.difference ?? 0), 0),
    openOutflow: rows.reduce((s, r) => s + r.unwind.openOutflow, 0),
    withWarnings: rows.filter((r) => r.unwind.warnings.length > 0).length,
  };
  return { ctx, keys, rows, totals };
}

const SCENARIO_STEP = 100;
const SCENARIO_LOW = -10;
const SCENARIO_HIGH = 15;

/** Current Nifty rounded to the nearest 100, then -1000 to +1500 in steps of 100: 26 levels. */
export function scenarioLevels(currentNifty: number): number[] {
  const centre = Math.round(currentNifty / SCENARIO_STEP) * SCENARIO_STEP;
  const out: number[] = [];
  for (let k = SCENARIO_LOW; k <= SCENARIO_HIGH; k += 1) out.push(centre + k * SCENARIO_STEP);
  return out;
}

type ScenarioGrid = {
  levels: number[];
  /** cells[row][level] */
  cells: UnwindAtLevel[][];
  exitTotals: number[];
};

export function scenarioGrid(book: Book, mode: ScenarioMode, rows: BookRow[] = book.rows): ScenarioGrid {
  const levels = scenarioLevels(book.ctx.inputs.currentNifty);
  const perLevel = levels.map((level) => pricesAtLevel(book.keys, level, mode, book.ctx));
  const cells = rows.map((row) => perLevel.map((prices) => unwindAtLevel(row.base, legOutflowAt(row, prices))));
  const exitTotals = levels.map((_, j) => cells.reduce((s, r) => s + (r[j].exitValue ?? 0), 0));
  return { levels, cells, exitTotals };
}

/** One product revalued at arbitrary levels (the one product What If). */
export function productAtLevels(book: Book, row: BookRow, levels: number[], mode: ScenarioMode): UnwindAtLevel[] {
  const subset = new Map(row.legs.map((lv) => [lv.priced.key, lv.priced] as const));
  return levels.map((level) => unwindAtLevel(row.base, legOutflowAt(row, pricesAtLevel(subset, level, mode, book.ctx))));
}
