import { describe, expect, it } from "vitest";

import { computeBook } from "@/lib/engine/book";
import { expectedDifferenceAtMaturity, expectedDifferenceTone } from "@/lib/engine/expected-difference";
import { grow } from "@/lib/engine/rates";
import { SEED, WORKBOOK_INPUTS } from "@/tests/helpers/book";

/** A book whose pots were sized so the interest-only path lands exactly on Face x (1 + Coupon) x Debentures. */
function balancedFixture(remainingOutflow: number) {
  const residualDays = 400;
  const terminal = 100_000_000 * 1.95;
  const atMaturity = { mob: terminal * 0.6, prem: terminal * 0.25, margin: terminal * 0.15 };
  return {
    grownMobilisation: atMaturity.mob / Math.pow(1.075, residualDays / 365),
    grownPremium: atMaturity.prem / Math.pow(1.051, residualDays / 365),
    grownMargin: atMaturity.margin / Math.pow(1.056, residualDays / 365),
    prodRate: 0.075,
    premRate: 0.051,
    marginRate: 0.056,
    residualDays,
    remainingOutflow,
    contractualTerminal: terminal,
  };
}

describe("expectedDifferenceAtMaturity", () => {
  it("is zero when there is no residual outflow", () => {
    const e = expectedDifferenceAtMaturity(balancedFixture(0));
    expect(Math.abs(e.difference)).toBeLessThan(1e-6);
    expect(e.interestOnlyBookAtMaturity).toBeCloseTo(e.contractualTerminal, 6);
  });

  it("is non-zero with a residual outflow, by that outflow grown at the premium rate", () => {
    const e = expectedDifferenceAtMaturity(balancedFixture(5_000_000));
    expect(e.difference).toBeCloseTo(-grow(5_000_000, 0.051, 400), 4);
    expect(e.remainingOutflowAtMaturity).toBeGreaterThan(5_000_000);
  });

  it("collapses to zero as the outflow is zeroed", () => {
    const sizes = [10_000_000, 1_000_000, 10_000, 0];
    const diffs = sizes.map((s) => Math.abs(expectedDifferenceAtMaturity(balancedFixture(s)).difference));
    for (let i = 1; i < diffs.length; i += 1) expect(diffs[i]).toBeLessThan(diffs[i - 1]);
    expect(diffs.at(-1)).toBeLessThan(1e-6);
  });

  it("does not grow anything when maturity has passed", () => {
    const e = expectedDifferenceAtMaturity({ ...balancedFixture(0), residualDays: -10 });
    expect(e.grownMobilisationAtMaturity).toBe(balancedFixture(0).grownMobilisation);
  });

  it("tones green near zero, amber and red as it grows against mobilisation", () => {
    expect(expectedDifferenceTone(1_000, 100_000_000)).toBe("green");
    expect(expectedDifferenceTone(2_000_000, 100_000_000)).toBe("amber");
    expect(expectedDifferenceTone(-20_000_000, 100_000_000)).toBe("red");
    expect(expectedDifferenceTone(null, 100_000_000)).toBe("neutral");
  });
});

describe("expected difference on the seeded book", () => {
  const book = computeBook(SEED, WORKBOOK_INPUTS);
  const noOpen = book.rows.filter((r) => r.legs.every((lv) => lv.priced.expired) && (r.product.coupon ?? 0) > 0);

  it("reads close to zero for products with no open legs and a coupon in the master", () => {
    expect(noOpen.length).toBeGreaterThan(50);
    const green = noOpen.filter((r) => expectedDifferenceTone(r.unwind.expected!.difference, r.product.mobilisation) === "green");
    expect(green.length / noOpen.length).toBeGreaterThan(0.9);
  });

  it("flags exactly the products whose master does not accrue to the terminal", () => {
    const off = noOpen.filter((r) => Math.abs(r.unwind.expected!.difference) / r.product.mobilisation! > 0.01).map((r) => r.product.name);
    expect(off).toEqual(["Nifty Accelerator - 337 - (30%PP) Phase II", "Nifty Accelerator - 716", "Nifty Accelerator - 759"]);
    expect(book.rows.find((r) => r.product.name === "Nifty Accelerator - 716")!.unwind.warnings).toContain("Premium Missing In Master");
  });

  it("flags the products whose master coupon is missing", () => {
    const missing = book.rows.filter((r) => r.product.coupon == null);
    expect(missing).toHaveLength(3);
    for (const r of missing) {
      expect(r.unwind.warnings).toContain("Coupon Missing Or Zero In Master");
      expect(expectedDifferenceTone(r.unwind.expected!.difference, r.product.mobilisation)).toBe("red");
    }
  });
});
