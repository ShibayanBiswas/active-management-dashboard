import type { OptionLeg, OptionTableRow, ProductMaster, UnwindResult } from "@/lib/types";
import type { ExcelCell } from "@/lib/workbook/excel-cells";
import {
  daysBetween,
  blankRepeatedDisplay,
  formatDeskDate,
  formatDeskRupees,
  formatNumber,
  formatPct,
  parseISODate,
  roundDeskMoney,
} from "@/lib/utils";
import { PRODUCT_BOOK_HEADERS } from "@/lib/workbook/export-columns";
import { productBookFactCells } from "@/lib/workbook/product-facts";

const PRICE_BLANK_EPS = 0.005;

/** Same live-leg gate as computeUnwind: drop blank / zero Required Quantity filler rows. */
export function liveLegsOf(product: ProductMaster): OptionLeg[] {
  const legs = product.legs ?? [];
  const qtyDriven = legs.some(
    (leg) => leg.reqQuantity != null && Number.isFinite(leg.reqQuantity) && leg.reqQuantity !== 0,
  );
  if (!qtyDriven) return legs;
  return legs.filter(
    (leg) => leg.reqQuantity != null && Number.isFinite(leg.reqQuantity) && leg.reqQuantity !== 0,
  );
}

export type ProductBookLegMark = {
  optionType: string;
  strike: number;
  spreads: number;
  original: string;
  unwindSide: string;
  quantity: number | null;
  premiumPerSpread: number | null;
  productPremiumAmount: number;
  unwindOptionPrice: number;
  premiumOutflowAmount: number;
  displayOnly: boolean;
};

export type ProductBookEconomics = {
  amtWithNbfcRs: number;
  grownValueRs: number;
  premiumCreditedRs: number;
  premGrownValueRs: number;
  premiumOutflowRs: number;
  unwindValueRs: number;
  bookUnwindPerDebentureRs: number;
};

export type ProductBookFunding = {
  totalDebs: number;
  amountWithNbfc: number;
  nbfcGrownValue: number;
  premiumCreditedPct: number;
  premiumGrownValue: number;
  currentPremOutflowPct: number;
};

export type ProductBookQuoteView = {
  quoteRs: number | null;
  productIRR: number | null;
  clientIRR: number | null;
  residualIRR: number | null;
  premiumOutflowRs: number | null;
  asOf: string;
  economics: ProductBookEconomics | null;
  funding: ProductBookFunding | null;
  legs: ProductBookLegMark[];
};

function expiredCounted(row: OptionTableRow): boolean {
  return row.expired && Math.abs(row.unwindPrice) > 0;
}

/** Options Book display mark: pricer price while the option is alive, intrinsic once it has expired. */
export function quoteViewFromUnwind(result: UnwindResult, asOf: string): ProductBookQuoteView {
  return {
    quoteRs: result.unwindQuoteRs,
    productIRR: result.productIRR,
    clientIRR: result.clientIRR,
    residualIRR: result.residualIRR,
    premiumOutflowRs: result.masterEconomics.premiumOutflowRs,
    asOf,
    economics: {
      amtWithNbfcRs: result.masterEconomics.amtWithNbfcRs,
      grownValueRs: result.masterEconomics.grownValueRs,
      premiumCreditedRs: result.masterEconomics.premiumCreditedRs,
      premGrownValueRs: result.masterEconomics.premGrownValueRs,
      premiumOutflowRs: result.masterEconomics.premiumOutflowRs,
      unwindValueRs: result.masterEconomics.unwindValueRs,
      bookUnwindPerDebentureRs: result.masterEconomics.unwindQuoteRs,
    },
    funding: {
      totalDebs: result.totalDebs,
      amountWithNbfc: result.amountWithNbfc,
      nbfcGrownValue: result.nbfcGrownValue,
      premiumCreditedPct: result.premium,
      premiumGrownValue: result.premiumGrownValue,
      currentPremOutflowPct: result.currentPremOutflowPct,
    },
    legs: result.optionRows.map((row) => {
      const countedExpired = expiredCounted(row);
      return {
        optionType: row.options,
        strike: row.strike,
        spreads: row.spreads,
        original: row.original,
        unwindSide: row.unwind,
        quantity: row.quantity,
        premiumPerSpread: row.premiumPerSpread,
        productPremiumAmount: row.prdPremium,
        unwindOptionPrice: countedExpired ? row.unwindPrice : Math.abs(row.unwindPrice),
        premiumOutflowAmount: row.premiumOutflowRs,
        displayOnly: row.expired && !countedExpired,
      };
    }),
  };
}

/** Premium Outflow Amount on legs whose option expiry falls inside the window. */
export function premiumOutflowInWindow(
  products: ProductMaster[],
  quoteFor: (product: ProductMaster) => ProductBookQuoteView | null,
  start: string,
  end: string,
): { total: number | null; legs: number; pending: boolean; products: number; priced: number } {
  if (!start || !end || start > end) return { total: null, legs: 0, pending: false, products: 0, priced: 0 };
  let total = 0;
  let legs = 0;
  let pending = false;
  let inWindow = 0;
  let priced = 0;
  for (const product of products) {
    const quote = quoteFor(product);
    const book = liveLegsOf(product);
    const hasWindowLeg = book.some((leg) => {
      const day = String(leg.expiry ?? "").slice(0, 10);
      return day >= start && day <= end;
    });
    if (hasWindowLeg) inWindow += 1;
    if (!quote) {
      if (hasWindowLeg) pending = true;
      continue;
    }
    if (hasWindowLeg) priced += 1;
    book.forEach((leg, index) => {
      const day = String(leg.expiry ?? "").slice(0, 10);
      if (day < start || day > end) return;
      const amount = quote.legs[index]?.premiumOutflowAmount;
      if (amount == null || !Number.isFinite(amount)) {
        pending = true;
        return;
      }
      total += amount;
      legs += 1;
    });
  }
  return { total: pending ? null : roundDeskMoney(total), legs, pending, products: inWindow, priced };
}

function staticSpread(leg: OptionLeg, product: ProductMaster): number | null {
  const masterPrice = leg.prdPrice ?? product.prdPrice;
  if (!Number.isFinite(masterPrice) || Math.abs(masterPrice) <= PRICE_BLANK_EPS) return null;
  return roundDeskMoney(Math.abs(masterPrice));
}

function flipSide(side: string): string {
  return side.trim().toLowerCase() === "buy" ? "Sell" : "Buy";
}

function staticAmount(leg: OptionLeg, product: ProductMaster): number {
  const masterPrice = leg.prdPrice ?? product.prdPrice;
  const reqQty = leg.reqQuantity ?? 0;
  return roundDeskMoney((Number.isFinite(masterPrice) ? masterPrice : 0) * -reqQty);
}

/**
 * One display row per live option leg.
 * Product facts repeat so the table can club them. Priced cells stay "…" until a quote arrives.
 */
export function buildProductBookMatrix(args: {
  serial: number;
  product: ProductMaster;
  asOf: string;
  quote: ProductBookQuoteView | null;
}): { rows: string[][]; displayOnly: boolean[] } {
  const legs = liveLegsOf(args.product);
  const pending = args.quote == null;
  const facts = productBookFactCells(args.product, args.asOf);
  const identity = [
    String(args.serial),
    args.product.productName?.trim() || "-",
    args.product.productCode?.trim() || "-",
    pending ? "…" : formatDeskRupees(args.quote?.quoteRs ?? null),
    formatDeskDate(args.quote?.asOf ?? args.asOf),
    pending ? "…" : formatPct(args.quote?.productIRR ?? null),
    pending ? "…" : formatPct(args.quote?.clientIRR ?? null),
    pending ? "…" : formatDeskRupees(args.quote?.premiumOutflowRs ?? null),
    pending ? "…" : formatPct(args.quote?.residualIRR ?? null),
    ...facts,
  ];

  const source = legs.length ? legs : [null];
  const rows = source.map((leg, index) => {
    const mark = args.quote?.legs[index];
    const spread = mark ? mark.premiumPerSpread : leg ? staticSpread(leg, args.product) : null;
    const amount = mark ? mark.productPremiumAmount : leg ? staticAmount(leg, args.product) : null;
    const optionType = mark?.optionType ?? (leg ? String(leg.optionType) : "-");
    const strike = mark ? mark.strike : leg?.strike;
    const spreads = mark ? mark.spreads : leg?.spreads;
    const original = mark?.original ?? (leg ? String(leg.originalSide) : "-");
    const unwindSide = mark?.unwindSide ?? (leg ? flipSide(String(leg.originalSide)) : "-");
    const quantity = mark ? mark.quantity : leg?.reqQuantity;
    return [
      ...identity,
      optionType || "-",
      strike == null || !Number.isFinite(strike) ? "-" : formatNumber(strike, 0),
      spreads == null || !Number.isFinite(spreads) ? "-" : formatNumber(spreads, 2),
      original || "-",
      unwindSide || "-",
      quantity == null || !Number.isFinite(quantity) ? "…" : formatNumber(quantity, 2),
      leg ? formatDeskDate(leg.expiry) : "-",
      spread == null ? "-" : formatNumber(spread, 2),
      amount == null ? "-" : formatDeskRupees(amount),
      mark ? formatNumber(mark.unwindOptionPrice, 2) : "…",
      mark ? formatDeskRupees(mark.premiumOutflowAmount) : "…",
    ];
  });
  return {
    rows,
    displayOnly: source.map((_, index) => args.quote?.legs[index]?.displayOnly ?? false),
  };
}

function excelDate(value: string): ExcelCell {
  const date = parseISODate(value);
  return Number.isNaN(date.getTime()) ? "-" : date;
}

function excelNumber(value: number | null | undefined): ExcelCell {
  return value == null || !Number.isFinite(value) ? "-" : value;
}

/** Product Book download rows. Money, rates, dates, and prices are Excel numbers. */
export function buildProductBookExcelMatrix(args: {
  serial: number;
  product: ProductMaster;
  asOf: string;
  quote: ProductBookQuoteView | null;
}): ExcelCell[][] {
  const legs = liveLegsOf(args.product);
  const pending = args.quote == null;
  const allotment = parseISODate(args.product.allotmentDate);
  const unwind = parseISODate(args.quote?.asOf ?? args.asOf);
  const invested =
    Number.isNaN(allotment.getTime()) || Number.isNaN(unwind.getTime())
      ? 0
      : Math.max(daysBetween(allotment, unwind), 0);
  const residual = Math.max((args.product.tenorDays ?? 0) - invested, 0);
  const identity: ExcelCell[] = [
    args.serial,
    args.product.productName?.trim() || "-",
    args.product.productCode?.trim() || "-",
    pending ? "-" : excelNumber(args.quote?.quoteRs),
    excelDate(args.quote?.asOf ?? args.asOf),
    pending ? "-" : excelNumber(args.quote?.productIRR),
    pending ? "-" : excelNumber(args.quote?.clientIRR),
    pending ? "-" : excelNumber(args.quote?.premiumOutflowRs),
    pending ? "-" : excelNumber(args.quote?.residualIRR),
    excelNumber(args.product.faceValue),
    excelNumber(args.product.initialNiftyLevel),
    excelNumber(args.product.coupon),
    excelNumber(args.product.inbuilt),
    excelNumber(args.product.tranCost),
    excelNumber(args.product.issuanceCost),
    excelNumber(args.product.marginCost),
    excelDate(args.product.deltaDate),
    excelDate(args.product.allotmentDate),
    excelDate(args.product.maturityDate),
    excelNumber(args.product.tenorDays),
    invested,
    residual,
  ];
  const source = legs.length ? legs : [null];
  return source.map((leg, index) => {
    const mark = args.quote?.legs[index];
    const spread = mark ? mark.premiumPerSpread : leg ? staticSpread(leg, args.product) : null;
    const amount = mark ? mark.productPremiumAmount : leg ? staticAmount(leg, args.product) : null;
    return [
      ...identity,
      mark?.optionType ?? (leg ? String(leg.optionType) : "-"),
      excelNumber(mark ? mark.strike : leg?.strike),
      excelNumber(mark ? mark.spreads : leg?.spreads),
      mark?.original ?? (leg ? String(leg.originalSide) : "-"),
      mark?.unwindSide ?? (leg ? flipSide(String(leg.originalSide)) : "-"),
      excelNumber(mark ? mark.quantity : leg?.reqQuantity),
      leg ? excelDate(leg.expiry) : "-",
      excelNumber(spread),
      excelNumber(amount),
      mark ? excelNumber(mark.unwindOptionPrice) : "-",
      mark ? excelNumber(mark.premiumOutflowAmount) : "-",
    ];
  });
}

/**
 * Screen rows stay a full grid. A value prints on the first row of the scroll
 * window and again only when the cell below it changes.
 */
export function clubProductBookDisplay(matrix: string[][], viewportIndex: number): string[][] {
  if (matrix.length === 0) return matrix;
  const top = Math.max(0, Math.min(viewportIndex, matrix.length - 1));
  return [...matrix.slice(0, top), ...blankRepeatedDisplay(matrix.slice(top))];
}
