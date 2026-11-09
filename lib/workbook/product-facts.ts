/**
 * Product Facts labels and values shared by the Unwinding tab, Excel, and PDF.
 * Multi Product Book uses the same master fields, without the two discount-rate cards.
 */
import type { ProductMaster, UnwindResult } from "@/lib/types";
import { daysBetween, formatDeskDate, formatDeskRupees, formatNumber, formatPct, parseISODate } from "@/lib/utils";

export function formatFactRupees(v: number | null | undefined): string {
  return formatDeskRupees(v);
}

/** Unwinding Product Facts cards and the Unwinding Summary Excel/PDF section. */
export function unwindProductFactRows(result: UnwindResult): Array<[string, string]> {
  return [
    ["Face Value", formatFactRupees(result.faceValue)],
    ["Initial Underlying Level", formatNumber(result.initialNiftyLevel, 0)],
    ["Contingent Coupon", formatPct(result.contingentCoupon)],
    ["Inbuilt", formatPct(result.inbuilt)],
    ["Transaction Cost", formatPct(result.tranCost)],
    ["Issuance Cost", formatPct(result.issuanceCost)],
    ["Margin Cost", formatPct(result.marginCost)],
    ["Product Discounting Rate", formatPct(result.discountingRate)],
    ["Premium Discounting Rate", formatPct(result.premiumRate)],
    ["Delta Date", formatDeskDate(result.deltaDate)],
    ["Allotment Date", formatDeskDate(result.allotmentDate)],
    ["Maturity Date", formatDeskDate(result.maturityDate)],
    ["Tenor", `${formatNumber(result.tenorDays, 0)} Days`],
    ["Invested Tenor", `${formatNumber(result.investedTenorDays, 0)} Days`],
    ["Residual Tenor", `${formatNumber(result.residualTenor, 0)} Days`],
  ];
}

export function productBookFactValues(product: ProductMaster, asOf: string) {
  const allotment = parseISODate(product.allotmentDate);
  const unwind = parseISODate(asOf);
  const invested =
    Number.isNaN(allotment.getTime()) || Number.isNaN(unwind.getTime())
      ? 0
      : Math.max(daysBetween(allotment, unwind), 0);
  const residual = Math.max(product.tenorDays - invested, 0);
  return {
    faceValue: formatFactRupees(product.faceValue),
    initialNiftyLevel: formatNumber(product.initialNiftyLevel, 0),
    contingentCoupon: formatPct(product.coupon),
    inbuilt: formatPct(product.inbuilt),
    tranCost: formatPct(product.tranCost),
    issuanceCost: formatPct(product.issuanceCost),
    marginCost: formatPct(product.marginCost),
    deltaDate: formatDeskDate(product.deltaDate),
    allotmentDate: formatDeskDate(product.allotmentDate),
    maturityDate: formatDeskDate(product.maturityDate),
    tenor:
      product.tenorDays != null && Number.isFinite(product.tenorDays)
        ? `${formatNumber(product.tenorDays, 0)} Days`
        : "-",
    invested: `${formatNumber(invested, 0)} Days`,
    residual: `${formatNumber(residual, 0)} Days`,
  };
}

/** Multi Product Book fact cells, in PRODUCT_BOOK_HEADERS order after the quote block. */
export function productBookFactCells(product: ProductMaster, asOf: string): string[] {
  const facts = productBookFactValues(product, asOf);
  return [
    facts.faceValue,
    facts.initialNiftyLevel,
    facts.contingentCoupon,
    facts.inbuilt,
    facts.tranCost,
    facts.issuanceCost,
    facts.marginCost,
    facts.deltaDate,
    facts.allotmentDate,
    facts.maturityDate,
    facts.tenor,
    facts.invested,
    facts.residual,
  ];
}
