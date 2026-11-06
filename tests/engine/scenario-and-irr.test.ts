import { describe, expect, it } from "vitest";

import { computeBook, productAtLevels, scenarioGrid, scenarioLevels } from "@/lib/engine/book";
import { priceAtLevel } from "@/lib/engine/leg-pricing";
import { capIrr, maxIrr, productUnwind } from "@/lib/engine/product-unwind";
import { SEED, WORKBOOK_INPUTS } from "@/tests/helpers/book";

describe("scenario ladder", () => {
  it("runs -1000 to +1500 in steps of 100 around the rounded current Nifty", () => {
    const levels = scenarioLevels(22_741.3);
    expect(levels).toHaveLength(26);
    expect(levels[0]).toBe(21_700);
    expect(levels[10]).toBe(22_700);
    expect(levels.at(-1)).toBe(24_200);
    expect(levels.every((l, i) => i === 0 || l - levels[i - 1] === 100)).toBe(true);
  });

  const book = computeBook(SEED, WORKBOOK_INPUTS);
  const live = [...book.keys.values()].find((k) => !k.expired && k.delta < -0.2)!;
  const expired = [...book.keys.values()].find((k) => k.expired && k.price > 0)!;

  it("delta mode is max(0, price + (level - spot) x delta)", () => {
    expect(priceAtLevel(live, 23_700, "delta", book.ctx)).toBeCloseTo(Math.max(0, live.price + 1000 * live.delta), 9);
    expect(priceAtLevel(live, 40_000, "delta", book.ctx)).toBe(0);
  });

  it("full mode reprices on Black Scholes and agrees at the current level", () => {
    expect(priceAtLevel(live, WORKBOOK_INPUTS.currentNifty, "full", book.ctx)).toBeCloseTo(live.price, 6);
    expect(priceAtLevel(live, 24_000, "full", book.ctx)).toBeLessThan(live.price);
  });

  it("expired legs keep their settled value at every level", () => {
    expect(priceAtLevel(expired, 30_000, "delta", book.ctx)).toBe(expired.price);
    expect(priceAtLevel(expired, 10_000, "full", book.ctx)).toBe(expired.price);
  });

  it("the grid at the current level reproduces the current unwind", () => {
    const grid = scenarioGrid(book, "delta");
    const at = grid.levels.indexOf(WORKBOOK_INPUTS.currentNifty);
    book.rows.forEach((row, i) => {
      if (row.unwind.current.unwindPrice == null) return;
      expect(grid.cells[i][at].unwindPrice).toBeCloseTo(row.unwind.current.unwindPrice, 6);
    });
    const one = productAtLevels(book, book.rows[0], [WORKBOOK_INPUTS.currentNifty], "full")[0];
    expect(one.unwindPrice).toBeCloseTo(book.rows[0].unwind.current.unwindPrice!, 6);
  });
});

describe("max IRR and caps", () => {
  it("is (1 + coupon) ^ (365 / tenor) - 1", () => {
    expect(maxIrr(1, 1875)).toBeCloseTo(Math.pow(2, 365 / 1875) - 1, 12);
  });

  it("is null for a bad coupon or tenor, and then caps nothing", () => {
    expect(maxIrr(null, 1875)).toBeNull();
    expect(maxIrr(1, 0)).toBeNull();
    expect(capIrr(0.2, null)).toBe(0.2);
    expect(capIrr(0.2, 0.15)).toBe(0.15);
    expect(capIrr(0.1, 0.15)).toBe(0.1);
  });

  it("caps current and assumed IRRs on the seeded book", () => {
    const book = computeBook(SEED, { ...WORKBOOK_INPUTS, assumedNifty: 26_000 });
    for (const r of book.rows) {
      if (r.unwind.maxIrr == null) continue;
      if (r.unwind.current.cappedIrr != null) expect(r.unwind.current.cappedIrr).toBeLessThanOrEqual(r.unwind.maxIrr + 1e-15);
      if (r.assumed.cappedIrr != null) expect(r.assumed.cappedIrr).toBeLessThanOrEqual(r.unwind.maxIrr + 1e-15);
    }
  });

  it("warns on a bad master and does not divide by zero", () => {
    const product = { ...SEED.products[0], coupon: 0, tenorDays: null, faceValue: 0, legs: [] };
    const { result } = productUnwind(product, [], WORKBOOK_INPUTS.valuationDate);
    expect(result.warnings).toEqual(expect.arrayContaining(["Coupon Missing Or Zero In Master", "Tenor Missing Or Not Positive In Master", "Face Value Missing Or Not Positive"]));
    expect(result.current.unwindPrice).toBeNull();
    expect(result.maxIrr).toBeNull();
  });
});
