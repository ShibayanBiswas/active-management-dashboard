import type { ProductMaster } from "@/lib/types";
import { daysBetween, deskTodayISO, formatDeskRupees, formatNumber, formatPct, parseISODate, roundDeskMoney } from "@/lib/utils";
import type { ExcelCell } from "@/lib/workbook/excel-cells";
import { POST_OBSERVATION_HEADERS } from "@/lib/workbook/export-columns";
import { liveLegsOf, type ProductBookQuoteView } from "@/lib/workbook/product-book-rows";

/** Every live option expiry is on or before the desk date. */
export function allOptionExpiriesPassed(product: ProductMaster, asOf: string): boolean {
  const legs = liveLegsOf(product);
  if (!legs.length) return false;
  const asOfDate = parseISODate(asOf);
  if (Number.isNaN(asOfDate.getTime())) return false;
  return legs.every((leg) => {
    const expiry = parseISODate(leg.expiry);
    return !Number.isNaN(expiry.getTime()) && daysBetween(asOfDate, expiry) <= 0;
  });
}

/** Mobilisation after costs, then less the margin funds. This is Amount with NBFC. */
export function amountWithNbfcRupees(product: ProductMaster): number {
  const costs = product.inbuilt + product.tranCost + product.issuanceCost + product.marginCost;
  return roundDeskMoney(product.mobilization * (1 - costs) - product.totalFundsForMargin);
}

export type PostObservationFigures = {
  expectedQuote: number;
  unwindQuote: number | null;
  netMobilisation: number;
  expectedAmount: number;
  unwindAmount: number | null;
  marginCost: number;
  totalFundsForMargin: number;
  totalDebs: number | null;
  amountWithNbfcPct: number | null;
  nbfcGrownPct: number | null;
  premiumCreditedPct: number | null;
  premiumGrownPct: number | null;
  currentPremOutflowPct: number | null;
  amtWithNbfcRs: number | null;
  grownValueRs: number | null;
  premiumCreditedRs: number | null;
  premGrownValueRs: number | null;
  premiumOutflowRs: number | null;
  residualTenure: number;
  /** Unwind Amount minus Expected Amount. */
  difference: number | null;
};

/** Days still left in the product tenor as of the desk date. */
export function residualTenureDays(product: ProductMaster, asOf: string): number {
  const allotment = parseISODate(product.allotmentDate);
  const asOfDate = parseISODate(asOf);
  if (Number.isNaN(allotment.getTime()) || Number.isNaN(asOfDate.getTime())) return Math.max(product.tenorDays, 0);
  const invested = Math.max(daysBetween(allotment, asOfDate), 0);
  return Math.max(product.tenorDays - invested, 0);
}

/**
 * Expected Maturity Quote is face value times one plus the contingent coupon.
 * Expected Amount is that quote times the number of debentures.
 * Unwind Quote Amount is the Product Book quote for one debenture.
 * Unwind Amount is that same quote times the debentures.
 * Difference is Unwind Amount minus Expected Amount.
 */
export function postObservationFigures(
  product: ProductMaster,
  quote: ProductBookQuoteView | null,
): PostObservationFigures {
  const coupon = Number.isFinite(product.coupon) ? product.coupon : 0;
  const face = Number.isFinite(product.faceValue) ? product.faceValue : 0;
  const expectedQuote = roundDeskMoney(face * (1 + coupon));
  const debentures = face > 0 ? product.mobilization / face : 0;
  const expectedAmount = roundDeskMoney(expectedQuote * debentures);
  const economics = quote?.economics ?? null;
  const funding = quote?.funding ?? null;
  const unwindQuote = quote?.quoteRs ?? null;
  const unwindAmount =
    unwindQuote != null && debentures > 0 ? roundDeskMoney(unwindQuote * debentures) : economics?.unwindValueRs ?? null;
  return {
    expectedQuote,
    unwindQuote,
    netMobilisation: product.mobilization,
    expectedAmount,
    unwindAmount,
    marginCost: product.marginCost,
    totalFundsForMargin: product.totalFundsForMargin,
    totalDebs: funding?.totalDebs ?? null,
    amountWithNbfcPct: funding?.amountWithNbfc ?? null,
    nbfcGrownPct: funding?.nbfcGrownValue ?? null,
    premiumCreditedPct: funding?.premiumCreditedPct ?? null,
    premiumGrownPct: funding?.premiumGrownValue ?? null,
    currentPremOutflowPct: funding?.currentPremOutflowPct ?? null,
    amtWithNbfcRs: economics?.amtWithNbfcRs ?? null,
    grownValueRs: economics?.grownValueRs ?? null,
    premiumCreditedRs: economics?.premiumCreditedRs ?? null,
    premGrownValueRs: economics?.premGrownValueRs ?? null,
    premiumOutflowRs: economics?.premiumOutflowRs ?? quote?.premiumOutflowRs ?? null,
    residualTenure: residualTenureDays(product, quote?.asOf || deskTodayISO()),
    difference: unwindAmount == null ? null : roundDeskMoney(unwindAmount - expectedAmount),
  };
}

const PERCENT_HEADERS = new Set([
  "Contingent Coupon",
  "Amount with NBFC Percent",
  "NBFC Grown Value Percent",
  "Premium Credited Percent",
  "Premium Grown Value Percent",
  "Current Premium Outflow Percent",
]);

/** Enough fraction digits that the visible count times the maturity quote still equals Expected Amount. */
function formatIssueCount(count: number, unitPrice: number): string {
  if (!Number.isFinite(count)) return "-";
  if (Math.abs(count - Math.round(count)) < 1e-6) return formatNumber(count, 0);
  const target = roundDeskMoney(unitPrice * count);
  for (let digits = 2; digits <= 10; digits += 1) {
    const shown = Number(count.toFixed(digits));
    if (roundDeskMoney(unitPrice * shown) === target) return formatNumber(count, digits);
  }
  return formatNumber(count, 10);
}

function show(value: number | null, pending: boolean, kind: "rupee" | "pct" | "int"): string {
  if (pending) return "…";
  if (value == null || !Number.isFinite(value)) return "-";
  if (kind === "pct") return formatPct(value);
  if (kind === "int") return formatNumber(value, 0);
  return formatDeskRupees(value);
}

/** The Product Book quote, with the Active Management block when it has been priced. */
type PostObservationQuote = ProductBookQuoteView & { am?: { expectedDifferenceRs: number | null } | null };

export function postObservationCells(
  serial: number,
  product: ProductMaster,
  quote: PostObservationQuote | null,
): ExcelCell[] {
  const pending = quote == null;
  const figures = postObservationFigures(product, quote);
  const live = (value: number | null): ExcelCell => (pending || value == null ? "-" : value);
  const row: ExcelCell[] = [
    serial,
    product.productName?.trim() || "-",
    product.productCode?.trim() || "-",
    Number.isFinite(product.faceValue) ? product.faceValue : 0,
    Number.isFinite(product.coupon) ? product.coupon : 0,
    figures.expectedQuote,
    live(figures.unwindQuote),
    figures.netMobilisation,
    figures.expectedAmount,
    live(figures.unwindAmount),
    figures.residualTenure,
    product.faceValue > 0 ? product.mobilization / product.faceValue : 0,
    live(figures.amountWithNbfcPct),
    live(figures.nbfcGrownPct),
    live(figures.premiumCreditedPct),
    live(figures.premiumGrownPct),
    live(figures.currentPremOutflowPct),
    figures.totalFundsForMargin,
    live(figures.amtWithNbfcRs),
    live(figures.grownValueRs),
    live(figures.premiumCreditedRs),
    live(figures.premGrownValueRs),
    live(figures.premiumOutflowRs),
    live(figures.difference),
    // Expected Difference at maturity (docs/11), the same figure as the Product Book column.
    live(quote?.am?.expectedDifferenceRs ?? null),
  ];
  if (row.length !== POST_OBSERVATION_HEADERS.length) {
    throw new Error("Post Observation row width does not match headers");
  }
  return row;
}

export function postObservationDisplayRow(
  serial: number,
  product: ProductMaster,
  quote: PostObservationQuote | null,
): string[] {
  const pending = quote == null;
  const cells = postObservationCells(serial, product, quote);
  const unitPrice = cells[POST_OBSERVATION_HEADERS.indexOf("Expected Maturity Quote")];
  return cells.map((value, index) => {
    const header = POST_OBSERVATION_HEADERS[index] ?? "";
    if (typeof value === "string") return pending && value === "-" && index > 2 ? "…" : value;
    if (typeof value !== "number") return "-";
    if (PERCENT_HEADERS.has(header)) return show(value, false, "pct");
    if (header === "Sr. No.") return show(value, false, "int");
    if (header === "Total Debentures in Issue") {
      return formatIssueCount(value, typeof unitPrice === "number" ? unitPrice : 0);
    }
    if (header === "Residual Tenure") return `${show(value, false, "int")} Days`;
    return show(value, false, "rupee");
  });
}

export function postObservationExcelRow(
  serial: number,
  product: ProductMaster,
  quote: PostObservationQuote | null,
): ExcelCell[] {
  return postObservationCells(serial, product, quote);
}
