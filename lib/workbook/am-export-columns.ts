/**
 * Active Management tabs on the Unwinding page: labels, headers, screen rows and Excel rows.
 * The screen tables, the Excel download and the PDF download all read these, so they agree.
 */
import { irrSet, type IrrFlags, type IrrSet } from "@/lib/active-management/irr";
import { observationFacts, type ObservationFacts } from "@/lib/active-management/observations";
import type { ProductPricerRow } from "@/lib/active-management/pricer-table";
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
const dateValue = (label: string, iso: string | null): AmValue => ({ label, text: formatDeskDate(iso), excel: day(iso) });
const textValue = (label: string, v: string | null): AmValue => ({ label, text: deskBlank(v), excel: deskBlank(v) });

function underlyingOf(product: ProductMaster, inputs: UnwindInputs): UnderlyingIndex {
  return inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
    ? inputs.underlying
    : underlyingFromProductName(product.productName, product.productCode);
}

/* ── Active Management ─────────────────────────────────────────────────── */

type ActiveManagementFigures = {
  underlying: UnderlyingIndex;
  actualTarget: number | null;
  actualTargetSource: string | null;
  effectiveTarget: number | null;
  facts: ObservationFacts;
  irr: IrrSet;
  /** Index level Expected IRR was priced at. */
  assumedLevel: number;
  /** False when no assumed level is set, so the underlying spot level was used. */
  assumedLevelSet: boolean;
  expectedIrr: number | null;
  expectedFlags: IrrFlags;
};

/**
 * Active Management figures for the unwind on screen. `inputs` are the inputs that unwind ran
 * on, expiry closes included: Expected IRR throws without them rather than settle expired
 * options at the assumed level.
 */
export function activeManagementFigures(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  result: UnwindResult;
  actualTarget: number | null;
  actualTargetSource: string | null;
  /** Desk assumed levels; null means the underlying spot level. */
  assumedLevels: { nifty: number | null; sensex: number | null };
}): ActiveManagementFigures {
  const { product, surface, inputs, result } = args;
  const underlying = underlyingOf(product, inputs);
  const assumed = underlying === "Sensex" ? args.assumedLevels.sensex : args.assumedLevels.nifty;
  const assumedLevelSet = assumed != null && assumed > 0;
  const assumedLevel = assumedLevelSet ? assumed : (deskPricingSpot({ ...inputs, underlying }) ?? inputs.spot);
  const expected = expectedIrrAtLevel({ product, surface, inputs, level: assumedLevel });
  const facts = observationFacts(product, inputs.unwindDate, inputs.expirySpots);
  return {
    underlying,
    actualTarget: args.actualTarget,
    actualTargetSource: args.actualTargetSource,
    effectiveTarget: residualTarget(args.actualTarget, facts),
    facts,
    irr: irrSet(result, product),
    assumedLevel,
    assumedLevelSet,
    expectedIrr: expected.expectedIrr,
    expectedFlags: expected.irr.flags,
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
  if (f.irr.flags.noCap) {
    out.push(
      "The coupon or the tenor is 0, so there is no cap. Product Internal Rate of Return shows - and Current Internal Rate of Return is not capped.",
    );
  }
  if (f.irr.flags.noInvestedTenor) {
    out.push(
      "The unwinding date is on or before the allotment date. Client Internal Rate of Return is 0.00% by rule, and Current Internal Rate of Return and Expected Internal Rate of Return at Assumed Level show -.",
    );
  } else if (f.irr.flags.nonPositiveQuote) {
    out.push(
      "The unwind quote is zero or below. Client Internal Rate of Return is 0.00% by rule, and Current Internal Rate of Return shows -.",
    );
  }
  if (!f.irr.flags.noInvestedTenor && f.expectedFlags.nonPositiveQuote) {
    out.push("At the assumed level the unwind quote is zero or below, so Expected Internal Rate of Return at Assumed Level shows -.");
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

export function activeManagementView(f: ActiveManagementFigures): ActiveManagementView {
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
      dateValue("Observation Start Date", f.facts.startDate),
      dateValue("Observation End Date", f.facts.endDate),
      dateValue("Next Observation Date", f.facts.nextDate),
      levelValue("Average So Far", f.facts.averageSoFar),
      textValue("Observation Status", f.facts.status),
    ],
    returns: [
      pctValue("Product Internal Rate of Return", f.irr.maxIrr),
      pctValue("Client Internal Rate of Return", f.irr.clientIRR),
      pctValue("Residual Internal Rate of Return", f.irr.residualIRR),
      pctValue("Current Internal Rate of Return", f.irr.currentIrr),
      pctValue("Expected Internal Rate of Return at Assumed Level", f.expectedIrr),
      levelValue("Assumed Level", f.assumedLevel),
      textValue("Assumed Level Source", f.assumedLevelSet ? `Assumed ${f.underlying} Level` : "Underlying Spot Level"),
    ],
    warnings: activeManagementWarnings(f),
    schedule: observationScheduleTable(f.facts),
  };
}

export function activeManagementExportDoc(view: ActiveManagementView): AmExportDoc {
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

/* ── Black Scholes Pricer ──────────────────────────────────────────────── */

/** The Pricer Table's 14 columns, then the Options Book cash for the same leg. */
const PRODUCT_PRICER_HEADERS = [
  ...PRICER_TABLE_HEADERS,
  "Original Buy or Sell",
  "Unwind Buy or Sell",
  "Unwind Quantity",
  "Unwind Option Price",
  "Premium Outflow Amount",
  "Settlement Fixing",
] as const;

export function productPricerTableView(rows: ProductPricerRow[]): AmTable {
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

export function productPricerExportDoc(table: AmTable, result: UnwindResult): AmExportDoc {
  return {
    screen: "Black-Scholes-Pricer",
    title: "Black Scholes Pricer",
    sheetName: "Black Scholes Pricer",
    orientation: "landscape",
    subtitle: `${table.text.length} Legs · Unwinding Date ${formatDeskDate(result.unwindDate)}`,
    inputs: false,
    sections: [{ title: "Black Scholes Marks And Options Book Cash", table }],
  };
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
  "Client Internal Rate of Return",
  "Change In Client Internal Rate of Return",
  "Current Internal Rate of Return",
  "Change In Current Internal Rate of Return",
  "Residual Internal Rate of Return",
  "Change In Residual Internal Rate of Return",
] as const;

export function scenarioGridTable(grid: ScenarioGrid): AmTable {
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
      PERCENT_FMT,
      PERCENT_FMT,
      PERCENT_FMT,
      PERCENT_FMT,
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
      formatPct(c.irr.clientIRR),
      formatPct(c.change.clientIRR),
      formatPct(c.irr.currentIrr),
      formatPct(c.change.currentIrr),
      formatPct(c.irr.residualIRR),
      formatPct(c.change.residualIRR),
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
      c.irr.clientIRR,
      c.change.clientIRR,
      num(c.irr.currentIrr),
      num(c.change.currentIrr),
      c.irr.residualIRR,
      c.change.residualIRR,
    ]),
    mergeCols: [],
    highlightRow: grid.cells.findIndex((c) => c.k === 0),
  };
}

export function scenarioGridExportDoc(grid: ScenarioGrid, table: AmTable): AmExportDoc {
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
