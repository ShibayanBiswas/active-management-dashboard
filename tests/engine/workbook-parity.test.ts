import { describe, expect, it } from "vitest";

import { computeBook } from "@/lib/engine/book";
import { fixingLookup } from "@/lib/engine/fixings";
import { priceKey, pricingKey, type PricingContext } from "@/lib/engine/leg-pricing";
import { observationLifecycle, residualTarget } from "@/lib/engine/observations";
import type { OptionType, Side } from "@/lib/types";
import { GOLDEN, SEED, WORKBOOK_INCONSISTENT, WORKBOOK_INPUTS } from "@/tests/helpers/book";

const book = computeBook(SEED, WORKBOOK_INPUTS);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

describe("workbook parity: unwind chain", () => {
  it("prices the 176 distinct products the summary lists", () => {
    expect(book.rows).toHaveLength(176);
    expect(book.rows.map((r) => r.product.id)).toEqual(GOLDEN.products.map((p) => p.id));
  });

  it.each(GOLDEN.products.filter((p) => !WORKBOOK_INCONSISTENT.has(p.id)).map((p, i) => [p.id, i] as const))("%s matches the cached unwind chain", (id) => {
    const index = GOLDEN.products.findIndex((p) => p.id === id);
    const row = book.rows[index];
    const c = GOLDEN.products[index].calculator as Record<string, number | null>;
    const legSum = GOLDEN.products[index].legs.reduce((s, l) => s + (l.premiumOutflow ?? 0) + (l.grownOutflow ?? 0), 0);
    expect(rel(row.unwind.netMobilisation!, c.netMobilisation!)).toBeLessThan(1e-9);
    expect(rel(row.unwind.grownMobilisation!, c.grownMobilisation!)).toBeLessThan(1e-9);
    expect(rel(row.unwind.premium, c.premium!)).toBeLessThan(1e-9);
    expect(rel(row.unwind.grownPremium!, c.grownPremium!)).toBeLessThan(1e-9);
    expect(rel(row.unwind.grownMargin!, c.grownMargin!)).toBeLessThan(1e-9);
    // Option marks differ from Excel's NORMDIST by the Abramowitz and Stegun normal approximation the Unwinding engine uses.
    expect(rel(row.unwind.current.premiumOutflow, legSum)).toBeLessThan(5e-4);
    expect(rel(row.unwind.current.unwindPrice!, c.unwindPrice!)).toBeLessThan(1e-4);
    expect(Math.abs(row.unwind.current.irr! - c.unwindIrr!)).toBeLessThan(5e-5);
    expect(Math.abs(row.unwind.maxIrr! - c.maxIrr!)).toBeLessThan(1e-12);
  });
});

describe("workbook parity: pricing keys", () => {
  const ctx: PricingContext = { inputs: WORKBOOK_INPUTS, surface: SEED.surface, bidAsk: SEED.bidAsk, chains: SEED.chains, lookup: fixingLookup(SEED.fixings) };
  const strikes = SEED.surface.moneyness.map((m) => m * SEED.surface.referenceLevel);
  /** The workbook prices strikes outside the surface columns at zero; the desk holds the edge vol flat instead. */
  const inGrid = (k: number) => k >= strikes[0] && k < strikes[strikes.length - 1];
  const live = Object.values(GOLDEN.pricing).filter((g) => g.expiry > WORKBOOK_INPUTS.valuationDate && g.baseVol != null && inGrid(g.strike));

  it("covers most live keys", () => expect(live.length).toBeGreaterThan(500));

  it("model price, model vol and delta match the workbook for every live key inside the surface", () => {
    for (const g of live) {
      const p = priceKey({ strike: g.strike, expiry: g.expiry, optionType: g.optionType as OptionType, side: g.side as Side }, ctx);
      expect(Math.abs(p.modelVol! - g.vol!), pricingKey(p)).toBeLessThan(1e-9);
      expect(Math.abs(p.price - g.modelPrice!), pricingKey(p)).toBeLessThan(0.01);
      expect(Math.abs(p.delta - g.delta!), pricingKey(p)).toBeLessThan(1e-4);
    }
  });
});

describe("workbook parity: observations", () => {
  /** The workbook's Nifty history ends 29-Sep-2026, so later observations read as pending there. */
  const historyEnd = "2026-09-29";
  const lookup = fixingLookup(SEED.fixings.filter((f) => f.date <= historyEnd));

  it("done, total, average and residual target match for every product", () => {
    SEED.products.forEach((p, i) => {
      const c = GOLDEN.products[i].calculator as Record<string, number | null>;
      const life = observationLifecycle(p.observationDates, WORKBOOK_INPUTS.valuationDate, lookup);
      expect(life.total, p.name).toBe(c.totalObservations);
      expect(life.done, p.name).toBe(c.doneObservations);
      if (life.done) expect(Math.abs(life.averageSoFar! - Number(c.averageSoFar)), p.name).toBeLessThan(1e-6);
      const residual = residualTarget(p.actualTarget, life);
      if (c.residualTarget == null) expect(residual, p.name).toBeNull();
      else expect(Math.abs(residual! - c.residualTarget), p.name).toBeLessThan(1e-6);
    });
  });
});
