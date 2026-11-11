/**
 * Active Management tabs on the Unwinding page: labels, headers, screen rows and Excel rows.
 * The screen tables, the Excel download and the PDF download all read these, so they agree.
 */
import { bookValue } from "@/lib/active-management/book-value";
import { irrSet, type IrrFlags } from "@/lib/active-management/irr";
import { expectedDifferenceAtMaturity } from "@/lib/active-management/maturity";
import {
  observationFacts,
  pendingObservationsText,
  type ObservationFacts,
} from "@/lib/active-management/observations";
import { productPricerTable, type ProductPricerRow } from "@/lib/active-management/pricer-table";
import { expectedIrrAtLevel, type ScenarioGrid } from "@/lib/active-management/scenario";
import { residualTarget } from "@/lib/active-management/targets";
import type { ProductMaster, UnderlyingIndex, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import {
  deskBlank,
  deskPricingSpot,
  formatDeskDate,
  formatDeskRupees,
  formatNumber,
  formatPct,
  parseISODate,
  underlyingFromProductName,
} from "@/lib/utils";
import { pricerTableExcelRows, pricerTableRowsFlat } from "@/lib/workbook/build-screen-excel";
import type { ExcelCell } from "@/lib/workbook/excel-cells";
import { PRICER_TABLE_HEADERS } from "@/lib/workbook/export-columns";
import { PRICER_MERGE_COLS } from "@/lib/workbook/table-merge";

/** Excel formats, the same strings excel-cells.ts gives the desk headers. */
const RUPEES_FMT = '"₹"#,##0.00';
const PERCENT_FMT = "0.00%";
const LEVEL_FMT = "#,##0.00";
const COUNT_FMT = "#,##0";

/** One labelled figure: screen text, native Excel value, and its Excel format. */
export type AmValue = { label: string; text: string; excel: ExcelCell; numFmt?: string };

export type AmTable = {
  headers: string[];
  /** Excel format per column. Undefined keeps the header-driven desk format. */
  numFmts: Array<string | undefined>;
  text: string[][];
  excel: ExcelCell[][];
  /** Clubbed cells inside a group, as on the Pricer Table. No clubbing when absent. */
  groupCol?: number;
  mergeCols?: readonly number[];
  /** Shaded row: the scenario base level. */
  highlightRow?: number;
};

export type AmExportDoc = {
  /** Filename token: SP-{screen}-{code}-{date}. */
  screen: string;
  title: string;
  sheetName: string;
  orientation: "portrait" | "landscape";
  /** Banner text after the product name and code. */
  subtitle?: string;
  /** Lead with the Unwinding Input Parameters. */
  inputs: boolean;
  sections: Array<{ title: string; values?: AmValue[]; table?: AmTable }>;
};

const level = (v: number | null | undefined) => formatNumber(v, 2);
const num = (v: number | null | undefined): ExcelCell => (v == null || !Number.isFinite(v) ? "-" : v);
const day = (iso: string | null): ExcelCell => {
  const d = parseISODate(iso);
  return Number.isNaN(d.getTime()) ? "-" : d;
};

const levelValue = (label: string, v: number | null): AmValue => ({ label, text: level(v), excel: num(v), numFmt: LEVEL_FMT });
const countValue = (label: string, v: number): AmValue => ({ label, text: formatNumber(v, 0), excel: v, numFmt: COUNT_FMT });
const pctValue = (label: string, v: number | null): AmValue => ({ label, text: formatPct(v), excel: num(v), numFmt: PERCENT_FMT });
const rupeeValue = (label: string, v: number | null): AmValue => ({
  label,
  text: formatDeskRupees(v),
  excel: num(v),
  numFmt: RUPEES_FMT,
});
const dateValue = (label: string, iso: string | null): AmValue => ({ label, text: formatDeskDate(iso), excel: day(iso) });
const textValue = (label: string, v: string | null): AmValue => ({ label, text: deskBlank(v), excel: deskBlank(v) });

function underlyingOf(product: ProductMaster, inputs: UnwindInputs): UnderlyingIndex {
  return inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
    ? inputs.underlying
    : underlyingFromProductName(product.productName, product.productCode);
}

/* ── Active Management ─────────────────────────────────────────────────── */

type ActiveManagementFigures = {
  actualTarget: number | null;
  actualTargetSource: string | null;
  effectiveTarget: number | null;
  facts: ObservationFacts;
  /** Today's desk spot for the underlying; null while it is not known. */
  currentLevel: number | null;
  /** The page's Spot Level: the level the unwind on screen ran at. */
  expectedLevel: number;
  /** Capped Client rate at the Current Level, on the page's date, debentures and spread. */
  currentIrr: number | null;
  currentFlags: IrrFlags | null;
  /** Capped Client rate of the unwind on screen. */
  expectedIrr: number | null;
  expectedFlags: IrrFlags;
  /** True when the Current Level is the page's level, so Current is the unwind on screen. */
  currentIsExpected: boolean;
  /** Expected Difference at Maturity of the unwind on screen. */
  expectedDifferenceRs: number | null;
  /** Exit Value at the Current Level: Unwind Value plus the carry on settled option cash (workbook BH). */
  exitValueRs: number | null;
};

/**
 * Active Management figures for the unwind on screen. `inputs` are the inputs that unwind ran
 * on, expiry closes included: Current IRR throws without them rather than settle expired options
 * at today's spot. Expected IRR and Expected Difference are the unwind on screen, at the page's
 * Spot Level. Current IRR and Exit Value are the same unwind at today's desk spot: when the page
 * is at that spot it is the unwind on screen, otherwise expectedIrrAtLevel reprices it there with
 * only the option spot moved.
 */
function activeManagementFigures(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  result: UnwindResult;
  actualTarget: number | null;
  actualTargetSource: string | null;
  /** Today's desk spots (useMultiQuotes().deskLevels). */
  deskLevels: { nifty: number | null; sensex: number | null };
}): ActiveManagementFigures {
  const { product, surface, inputs, result } = args;
  const underlying = underlyingOf(product, inputs);
  const expectedLevel = deskPricingSpot({ ...inputs, underlying }) ?? inputs.spot;
  const desk = underlying === "Sensex" ? args.deskLevels.sensex : args.deskLevels.nifty;
  const currentLevel = desk != null && desk > 0 ? desk : null;
  const expected = irrSet(result, product);
  // Half a paisa, the tolerance the desk uses to call a typed level the desk spot.
  const currentIsExpected = currentLevel != null && Math.abs(currentLevel - expectedLevel) < 0.005;
  const current =
    currentLevel == null || currentIsExpected
      ? null
      : expectedIrrAtLevel({ product, surface, inputs, level: currentLevel });
  const facts = observationFacts(product, inputs.unwindDate, inputs.expirySpots);
  return {
    actualTarget: args.actualTarget,
    actualTargetSource: args.actualTargetSource,
    effectiveTarget: residualTarget(args.actualTarget, facts),
    facts,
    currentLevel,
    expectedLevel,
    currentIrr: currentLevel == null ? null : current ? current.expectedIrr : expected.currentIrr,
    currentFlags: currentLevel == null ? null : current ? current.irr.flags : expected.flags,
    expectedIrr: expected.currentIrr,
    expectedFlags: expected.flags,
    currentIsExpected,
    expectedDifferenceRs: expectedDifferenceAtMaturity(product, result, surface),
    exitValueRs: currentLevel == null ? null : current ? current.exitValueRs : bookValue(product, result).exitValueRs,
  };
}

const OBSERVATION_SCHEDULE_HEADERS = ["Observation Date", "Status", "Index Close", "Provisional"] as const;

function observationScheduleTable(facts: ObservationFacts): AmTable {
  const provisional = (passed: boolean, today: boolean) => (!passed ? "-" : today ? "Yes" : "No");
  return {
    headers: [...OBSERVATION_SCHEDULE_HEADERS],
    numFmts: [undefined, undefined, LEVEL_FMT, undefined],
    text: facts.points.map((p) => [
      formatDeskDate(p.date),
      p.passed ? "Passed" : "Upcoming",
      level(p.fixing),
      provisional(p.passed, p.provisional),
    ]),
    excel: facts.points.map((p) => [
      day(p.date),
      p.passed ? "Passed" : "Upcoming",
      num(p.fixing),
      provisional(p.passed, p.provisional),
    ]),
    mergeCols: [],
  };
}

/** Plain-word warnings for the figures above. */
function activeManagementWarnings(f: ActiveManagementFigures): string[] {
  const out: string[] = [];
  const dates = (list: string[]) => list.map((d) => formatDeskDate(d)).join(", ");
  if (f.facts.missingFixings.length) {
    out.push(
      `No index close was found for ${dates(f.facts.missingFixings)}. Average So Far and Effective Target show - until it arrives.`,
    );
  }
  const today = f.facts.points.filter((p) => p.provisional).map((p) => p.date);
  if (today.length) {
    out.push(
      `The observation on ${dates(today)} is today. Its index close is provisional until the market closes, so check it again after the close.`,
    );
  }
  if (f.expectedFlags.noCap) {
    out.push(
      "The coupon or the tenor is 0, so there is no cap, and Current and Expected Internal Rates of Return are not capped.",
    );
  }
  if (f.currentLevel == null) {
    out.push("Today's index level is not known yet, so Current Internal Rate of Return, Exit Value and Current Level show -.");
  }
  if (f.expectedFlags.noInvestedTenor) {
    out.push(
      "The unwinding date is on or before the allotment date. Client Internal Rate of Return is 0.00% by rule, and Current and Expected Internal Rates of Return show -.",
    );
    return out;
  }
  // The rates are on the book quote, Exit Value per debenture, not on the headline Unwind Quote.
  const currentNonPositive = f.currentFlags?.nonPositiveQuote === true;
  if (f.expectedFlags.nonPositiveQuote && (f.currentIsExpected || currentNonPositive)) {
    out.push(
      "Exit Value per debenture is zero or below, so Current and Expected Internal Rates of Return show -.",
    );
  } else if (f.expectedFlags.nonPositiveQuote) {
    out.push("At the Expected Level, Exit Value per debenture is zero or below, so Expected Internal Rate of Return shows -.");
  } else if (currentNonPositive) {
    out.push("At the Current Level, Exit Value per debenture is zero or below, so Current Internal Rate of Return shows -.");
  }
  return out;
}

type ActiveManagementView = {
  targets: AmValue[];
  observations: AmValue[];
  returns: AmValue[];
  warnings: string[];
  schedule: AmTable;
};

function activeManagementView(f: ActiveManagementFigures): ActiveManagementView {
  return {
    targets: [
      levelValue("Actual Target", f.actualTarget),
      textValue("Actual Target Source", f.actualTargetSource),
      levelValue("Effective Target", f.effectiveTarget),
    ],
    observations: [
      countValue("Observations Total", f.facts.total),
      countValue("Observations Passed", f.facts.passed),
      countValue("Observations Left", f.facts.left),
      textValue(
        "Pending Observations",
        pendingObservationsText(f.facts.points.filter((p) => !p.passed).map((p) => p.date)),
      ),
      dateValue("Observation Start Date", f.facts.startDate),
      dateValue("Observation End Date", f.facts.endDate),
      dateValue("Next Observation Date", f.facts.nextDate),
      levelValue("Average So Far", f.facts.averageSoFar),
      textValue("Observation Status", f.facts.status),
    ],
    returns: [
      pctValue("Current Internal Rate of Return", f.currentIrr),
      pctValue("Expected Internal Rate of Return", f.expectedIrr),
      rupeeValue("Expected Difference", f.expectedDifferenceRs),
      rupeeValue("Exit Value", f.exitValueRs),
      levelValue("Current Level", f.currentLevel),
      levelValue("Expected Level", f.expectedLevel),
    ],
    warnings: activeManagementWarnings(f),
    schedule: observationScheduleTable(f.facts),
  };
}

function activeManagementExportDoc(view: ActiveManagementView): AmExportDoc {
  return {
    screen: "Active-Management",
    title: "Active Management",
    sheetName: "Active Management",
    orientation: "portrait",
    inputs: true,
    sections: [
      { title: "Targets", values: view.targets },
      { title: "Observations", values: view.observations },
      { title: "Internal Rates of Return", values: view.returns },
      ...(view.warnings.length
        ? [{ title: "Warnings", values: view.warnings.map((w) => ({ label: "Warning", text: w, excel: w })) }]
        : []),
      { title: "Observation Schedule", table: view.schedule },
    ],
  };
}

/** The Active Management tab for the unwind on screen: its panels and its download. */
export function activeManagementTab(
  args: Parameters<typeof activeManagementFigures>[0],
): { view: ActiveManagementView; doc: AmExportDoc } {
  const view = activeManagementView(activeManagementFigures(args));
  return { view, doc: activeManagementExportDoc(view) };
}

/* ── Pricer Table ──────────────────────────────────────────────────────── */

/**
 * The Pricer Table's 14 columns, then the Options Book cash for the same leg. Bid Offer Spread is
 * the z each leg was priced with (Sell at σ − z/2, Buy at σ + z/2): the flat spread typed on the
 * page, or 2 × the Bid Ask table's s for that leg's expiry when the input is blank.
 */
const PRODUCT_PRICER_HEADERS = [
  ...PRICER_TABLE_HEADERS,
  "Original Buy or Sell",
  "Unwind Buy or Sell",
  "Unwind Quantity",
  "Unwind Option Price",
  "Premium Outflow Amount",
  "Settlement Fixing",
] as const;

function productPricerTableView(rows: ProductPricerRow[]): AmTable {
  const pricerText = pricerTableRowsFlat(rows);
  const pricerExcel = pricerTableExcelRows(rows);
  return {
    headers: [...PRODUCT_PRICER_HEADERS],
    // Header-driven formats, as on the Pricer Table download.
    numFmts: PRODUCT_PRICER_HEADERS.map(() => undefined),
    text: rows.map((r, i) => [
      ...pricerText[i]!,
      deskBlank(r.originalSide),
      deskBlank(r.unwindSide),
      formatNumber(r.unwindQuantity, 2),
      formatNumber(r.unwindOptionPrice, 2),
      formatDeskRupees(r.premiumOutflowRs),
      level(r.settlementFixing),
    ]),
    excel: rows.map((r, i) => [
      ...pricerExcel[i]!,
      deskBlank(r.originalSide),
      deskBlank(r.unwindSide),
      r.unwindQuantity,
      r.unwindOptionPrice,
      r.premiumOutflowRs,
      num(r.settlementFixing),
    ]),
    groupCol: 0,
    mergeCols: PRICER_MERGE_COLS,
  };
}

function productPricerExportDoc(table: AmTable, result: UnwindResult): AmExportDoc {
  return {
    screen: "Pricer-Table",
    title: "Pricer Table",
    sheetName: "Pricer Table",
    orientation: "landscape",
    subtitle: `${table.text.length} Legs · Unwinding Date ${formatDeskDate(result.unwindDate)}`,
    inputs: false,
    sections: [{ title: "Black Scholes Marks And Options Book Cash", table }],
  };
}

/** The Pricer Table tab for the unwind on screen: its table and its download. */
export function productPricerTab(basis: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  result: UnwindResult;
}): { table: AmTable; doc: AmExportDoc } {
  const table = productPricerTableView(productPricerTable(basis));
  return { table, doc: productPricerExportDoc(table, basis.result) };
}

/* ── Scenario Grid ─────────────────────────────────────────────────────── */

/** Why every level equals the base, or null when the level moves the quote. */
export function scenarioFlatNote(grid: ScenarioGrid): string | null {
  if (!grid.flat) return null;
  return grid.expiredLegs > 0
    ? "Every option has expired, so the index level does not move the quote."
    : "This product has no options, so the index level does not move the quote.";
}

const SCENARIO_GRID_HEADERS = [
  "Index Level",
  "Change In Level",
  "Unwind Quote Amount",
  "Change In Unwind Quote Amount",
  "Unwind Quote Percent",
  "Premium Outflow",
  "Change In Premium Outflow",
  "Unwind Value",
  "Change In Unwind Value",
  "Current Internal Rate of Return",
  "Change In Current Internal Rate of Return",
  "Expected Difference",
  "Change In Expected Difference",
] as const;

function scenarioGridTable(grid: ScenarioGrid): AmTable {
  const rupees = formatDeskRupees;
  return {
    headers: [...SCENARIO_GRID_HEADERS],
    numFmts: [
      LEVEL_FMT,
      LEVEL_FMT,
      RUPEES_FMT,
      RUPEES_FMT,
      PERCENT_FMT,
      RUPEES_FMT,
      RUPEES_FMT,
      RUPEES_FMT,
      RUPEES_FMT,
      PERCENT_FMT,
      PERCENT_FMT,
      RUPEES_FMT,
      RUPEES_FMT,
    ],
    text: grid.cells.map((c) => [
      level(c.level),
      level(c.shift),
      rupees(c.unwindQuoteRs),
      rupees(c.change.unwindQuoteRs),
      formatPct(c.unwindQuotePct),
      rupees(c.premiumOutflowRs),
      rupees(c.change.premiumOutflowRs),
      rupees(c.unwindValueRs),
      rupees(c.change.unwindValueRs),
      formatPct(c.irr.currentIrr),
      formatPct(c.change.currentIrr),
      rupees(c.expectedDifferenceRs),
      rupees(c.change.expectedDifferenceRs),
    ]),
    excel: grid.cells.map((c) => [
      c.level,
      c.shift,
      c.unwindQuoteRs,
      c.change.unwindQuoteRs,
      c.unwindQuotePct,
      c.premiumOutflowRs,
      c.change.premiumOutflowRs,
      c.unwindValueRs,
      c.change.unwindValueRs,
      num(c.irr.currentIrr),
      num(c.change.currentIrr),
      num(c.expectedDifferenceRs),
      num(c.change.expectedDifferenceRs),
    ]),
    mergeCols: [],
    highlightRow: grid.cells.findIndex((c) => c.k === 0),
  };
}

/** The Scenario Grid tab for a priced grid: its table and its download. */
export function scenarioGridTab(grid: ScenarioGrid): { table: AmTable; doc: AmExportDoc } {
  const table = scenarioGridTable(grid);
  return { table, doc: scenarioGridExportDoc(grid, table) };
}

function scenarioGridExportDoc(grid: ScenarioGrid, table: AmTable): AmExportDoc {
  const basis = `${grid.underlying} Base Level ${level(grid.baseSpot)} · Steps Of ${formatNumber(grid.step, 0)} Index Points · Unwinding Date ${formatDeskDate(grid.unwindDate)}`;
  const note = scenarioFlatNote(grid);
  return {
    screen: "Scenario-Grid",
    title: "Scenario Grid",
    sheetName: "Scenario Grid",
    orientation: "landscape",
    subtitle: note ? `${basis} · ${note}` : basis,
    inputs: false,
    sections: [{ title: "Unwind At Each Index Level", table }],
  };
}
