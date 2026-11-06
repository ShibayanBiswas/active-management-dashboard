import { describe, expect, it } from "vitest";

import { fixingLookup } from "@/lib/engine/fixings";
import { joinMonths, observationLifecycle, residualTarget } from "@/lib/engine/observations";

const lookup = fixingLookup([
  { date: "2026-01-27", close: 24000 },
  { date: "2026-04-28", close: 25000 },
  { date: "2026-07-24", close: 26000 },
]);
const dates = ["2026-01-27", "2026-04-28", "2026-07-28", "2026-10-27"];

describe("observation lifecycle", () => {
  it("counts done, total and pending at the valuation date", () => {
    const life = observationLifecycle(dates, "2026-05-01", lookup);
    expect([life.done, life.total, life.pending]).toEqual([2, 4, 2]);
    expect(life.averageSoFar).toBe(24500);
    expect(life.status).toBe("Observations Live");
    expect(life.pendingMonths).toBe("Jul-26 & Oct-26");
  });

  it("uses the last close before a holiday observation", () => {
    const life = observationLifecycle(["2026-07-26"], "2026-08-01", lookup);
    expect(life.fixings).toEqual([26000]);
  });

  it("reports a missing fixing rather than inventing one", () => {
    const life = observationLifecycle(["2026-10-27"], "2026-10-30", lookup);
    expect(life.done).toBe(0);
    expect(life.missingFixings).toEqual(["2026-10-27"]);
  });

  it("names the three statuses and the empty case", () => {
    expect(observationLifecycle(dates, "2025-12-01", lookup).status).toBe("Not Started");
    expect(observationLifecycle(dates.slice(0, 2), "2026-12-01", lookup).status).toBe("Observations Done");
    expect(observationLifecycle([], "2026-12-01", lookup).status).toBe("No Observations");
  });
});

describe("residual target", () => {
  it("is (Target x Total - Average x Done) / Pending", () => {
    expect(residualTarget(25000, { total: 4, done: 2, pending: 2, averageSoFar: 24500 })).toBe(25500);
  });

  it("is the actual target before any observation", () => {
    expect(residualTarget(25000, { total: 4, done: 0, pending: 4, averageSoFar: null })).toBe(25000);
  });

  it("never divides by zero pending", () => {
    expect(residualTarget(25000, { total: 4, done: 4, pending: 0, averageSoFar: 25100 })).toBeNull();
    expect(residualTarget(null, { total: 4, done: 1, pending: 3, averageSoFar: 25100 })).toBeNull();
  });
});

describe("pending months", () => {
  it("joins months without errors", () => {
    expect(joinMonths([])).toBe("-");
    expect(joinMonths(["2026-07-28"])).toBe("Jul-26");
    expect(joinMonths(["2026-07-28", "2026-10-27", "2027-01-25"])).toBe("Jul-26, Oct-26 & Jan-27");
  });
});
