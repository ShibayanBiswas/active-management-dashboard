/**
 * Desk invariants on the seeded book: Residual Target guards, Max IRR caps, the scenario ladder, Expected Difference at
 * Maturity for products with nothing outstanding, and the summary totals. Exits non-zero on any failure.
 */
import { SEED } from "../lib/data/seed";
import { computeBook, scenarioGrid, scenarioLevels } from "../lib/engine/book";
import { expectedDifferenceAtMaturity } from "../lib/engine/expected-difference";
import { residualTarget } from "../lib/engine/observations";
import { defaultInputs } from "../lib/desk-defaults";

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

const inputs = { ...defaultInputs(SEED.asOf), assumedNifty: SEED.asOf.assumedNifty };
const book = computeBook(SEED, inputs);
const fullBook = computeBook(SEED, { ...inputs, scenarioMode: "full" });

// Residual Target
check("Residual Target formula", residualTarget(25000, { total: 4, done: 2, pending: 2, averageSoFar: 24500 }) === 25500);
check("Residual Target is null with nothing pending", residualTarget(25000, { total: 3, done: 3, pending: 0, averageSoFar: 24000 }) === null);
const residualBad = book.rows.filter((r) => r.lifecycle.pending === 0 && r.residualTarget != null);
check("No product divides by zero pending", residualBad.length === 0, `${book.rows.filter((r) => r.lifecycle.pending === 0).length} products fully observed`);

// Max IRR caps
const overCap = [...book.rows, ...fullBook.rows].filter(
  (r) => r.unwind.maxIrr != null && ((r.unwind.current.cappedIrr ?? -Infinity) > r.unwind.maxIrr + 1e-12 || (r.assumed.cappedIrr ?? -Infinity) > r.unwind.maxIrr + 1e-12),
);
check("Current and assumed IRRs never exceed Max IRR", overCap.length === 0);
const capped = book.rows.filter((r) => r.unwind.current.irr != null && r.unwind.maxIrr != null && r.unwind.current.irr > r.unwind.maxIrr).length;
check("Max IRR is (1 + Coupon) ^ (365 / Tenor) - 1", book.rows.every((r) => r.unwind.maxIrr == null || Math.abs(r.unwind.maxIrr - (Math.pow(1 + r.product.coupon!, 365 / r.product.tenorDays!) - 1)) < 1e-12), `${capped} products capped`);
check("Bad coupon or tenor is flagged", book.rows.filter((r) => r.unwind.maxIrr == null).every((r) => r.unwind.warnings.some((w) => /Coupon|Tenor/.test(w))));

// Scenario ladder
const levels = scenarioLevels(inputs.currentNifty);
const centre = Math.round(inputs.currentNifty / 100) * 100;
check("Ladder has 26 levels from -1000 to +1500 step 100", levels.length === 26 && levels[0] === centre - 1000 && levels[25] === centre + 1500 && levels.every((l, i) => !i || l - levels[i - 1] === 100), `${levels[0]} to ${levels[25]}`);
const grid = scenarioGrid(book, "delta");
const at = levels.indexOf(centre);
const atCurrent = book.rows.every((r, i) => {
  if (r.unwind.current.unwindPrice == null) return true;
  const shifted = grid.cells[i][at].unwindPrice!;
  // The centre is the current Nifty rounded to 100, so allow the delta move from current to centre.
  return Math.abs(shifted - r.unwind.current.unwindPrice) / r.unwind.current.unwindPrice < 0.02;
});
check("Ladder centre reproduces the current unwind", atCurrent);
const monotone = grid.exitTotals.every((t, i) => !i || t >= grid.exitTotals[i - 1] - 1);
check("Book exit value rises with Nifty under the delta ladder", monotone, `${(grid.exitTotals[0] / 1e7).toFixed(2)} to ${(grid.exitTotals[25] / 1e7).toFixed(2)} crore`);

// Expected Difference at Maturity
const balanced = expectedDifferenceAtMaturity({ grownMobilisation: 1e8, grownPremium: 0, grownMargin: 0, prodRate: 0.075, premRate: 0.05, marginRate: 0.05, residualDays: 365, remainingOutflow: 0, contractualTerminal: 1.075e8 });
check("Expected Difference is zero for a balanced no-outflow book", Math.abs(balanced.difference) < 1e-6);
const noOpen = book.rows.filter((r) => r.legs.every((lv) => lv.priced.expired) && (r.product.coupon ?? 0) > 0);
const nearZero = noOpen.filter((r) => Math.abs(r.unwind.expected!.difference) / r.product.mobilisation! <= 0.005);
check("Expected Difference is near zero for products with no open legs", nearZero.length / noOpen.length > 0.9, `${nearZero.length} of ${noOpen.length}`);

// Summary totals
const sum = (f: (r: (typeof book.rows)[number]) => number | null | undefined) => book.rows.reduce((s, r) => s + (f(r) ?? 0), 0);
check(
  "Summary totals equal the sum of the rows",
  Math.abs(book.totals.mobilisation - sum((r) => r.product.mobilisation)) < 1e-6 &&
    Math.abs(book.totals.exitValueCurrent - sum((r) => r.unwind.current.exitValue)) < 1e-3 &&
    Math.abs(book.totals.exitValueAssumed - sum((r) => r.assumed.exitValue)) < 1e-3 &&
    Math.abs(book.totals.expectedDifference - sum((r) => r.unwind.expected?.difference)) < 1e-3,
  `${book.totals.products} products, ${(book.totals.mobilisation / 1e7).toFixed(3)} crore mobilised, ${(book.totals.exitValueCurrent / 1e7).toFixed(3)} crore exit value`,
);
check("Each product is counted once", new Set(book.rows.map((r) => r.product.id)).size === book.rows.length);

console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll Active Management checks passed");
process.exit(failures.length ? 1 : 0);
