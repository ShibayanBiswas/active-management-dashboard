import { legExpiryYmd, spotForExpiredSellPut } from "@/lib/engine/expiry-spots";
import { priceLeg, unwindMarkPrice } from "@/lib/engine/pricer";
import { bookPremiumFraction } from "@/lib/engine/product-premium";
import type {
  MasterEconomics,
  OptionTableRow,
  ProductMaster,
  UnwindInputs,
  UnwindResult,
  VolSurface,
} from "@/lib/types";
import {
  daysBetween,
  deskPricingSpot,
  parseISODate,
  roundDeskMoney,
  underlyingFromProductName,
} from "@/lib/utils";

/** Implied annual rate that grows pv to fv over nperYears (zero-coupon). */
export function rateZeroCoupon(nperYears: number, pv: number, fv: number): number {
  if (nperYears <= 0 || pv === 0) return 0;
  const ratio = fv / pv;
  if (ratio <= 0) return 0;
  return Math.pow(ratio, 1 / nperYears) - 1;
}

function flipSide(side: string): string {
  return side.trim().toLowerCase() === "buy" ? "Sell" : "Buy";
}

/** Unwind Buy is an outflow (−). Unwind Sell is an inflow (+). */
export function signedUnwindPrice(mark: number, unwindSide: string): number {
  const abs = Math.abs(mark);
  return unwindSide.trim().toLowerCase() === "sell" ? abs : -abs;
}

/**
 * Expired option intrinsic at the settlement spot. Never negative.
 * Put: max(strike − spot, 0). Call: max(spot − strike, 0).
 */
export function expiredIntrinsicMark(spot: number, strike: number, isCall: boolean): number {
  const raw = isCall ? spot - strike : strike - spot;
  return roundDeskMoney(Math.max(raw, 0));
}

/** Expired put intrinsic. Kept for the sell-put checks. */
export function expiredSellPutMark(spot: number, strike: number): number {
  return expiredIntrinsicMark(spot, strike, false);
}

/** Prices below this threshold are treated as blank in the options book. */
const PRICE_BLANK_EPS = 0.005;

/** Contingent Level when set; otherwise Initial Underlying Level; else 1 (guard). */
export function resolveContingentLevel(product: ProductMaster): number {
  if (product.contingentLevel > 0) return product.contingentLevel;
  if (product.initialNiftyLevel > 0) return product.initialNiftyLevel;
  return 1;
}

/**
 * Full unwind valuation — headline quote plus whole-book rupee economics.
 *
 * Whole-book rupee values:
 *   Amt with NBFC  = Mobilization × (1 − Σcosts) − TotalFundsForMargin
 *   Grown Value    = FV(prdDisc, inv/365, −AmtWithNBFC) + FV(marginFundingRate, inv/365, −TotalFundsForMargin)
 *   Prem Grown     = FV(premDisc, inv/365, −PremiumCredited)
 *   Premium Outflow= Σ each leg's Premium Outflow Amount
 *   Unwind Value   = Grown + PremGrown + PremiumOutflow
 *   Unwind Quote   = Unwind Value / TotalDebs
 *
 * Headline percent quote:
 *   NBFC Grown %   = Grown Value / Mobilization
 *   Pricer Unwind  = NBFCGrown% + PremGrown% + PremOutflow% + Margin×(Tenor−Inv)/Tenor
 */
export function computeUnwind(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
}): UnwindResult {
  const { product, surface, inputs } = args;
  const underlying =
    inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
      ? inputs.underlying
      : underlyingFromProductName(product.productName, product.productCode);
  const spot = deskPricingSpot({ ...inputs, underlying }) ?? inputs.spot;
  const dens = inputs.debentures;
  const bidAskSpread = inputs.bidAskSpread ?? 0;
  const unwindDate = parseISODate(inputs.unwindDate);
  const allotment = parseISODate(product.allotmentDate);
  const face = product.faceValue;
  const tenor = product.tenorDays;
  // Unwind before allotment is not meaningful — clamp invested tenor at zero.
  const invested = Math.max(daysBetween(allotment, unwindDate), 0);
  const residual = Math.max(tenor - invested, 0);
  const growth = invested / 365;

  const totalDebs = product.mobilization / face;
  const costSum = product.inbuilt + product.tranCost + product.issuanceCost + product.marginCost;
  const amountWithNbfc = 1 - costSum;

  // Whole-book rupee economics
  const amtWithNbfcRs = product.mobilization * amountWithNbfc - product.totalFundsForMargin;
  const grownValueRs =
    amtWithNbfcRs * Math.pow(1 + product.prdDiscRate, growth) +
    product.totalFundsForMargin * Math.pow(1 + product.marginFundingRate, growth);
  const nbfcGrownValue = grownValueRs / product.mobilization;

  const premiumFraction = bookPremiumFraction(product);
  const premiumCreditedRs = premiumFraction * Math.max(product.mobilization, 0);
  const premGrownValueRs = premiumCreditedRs * Math.pow(1 + product.premDiscRate, growth);
  const premiumGrownValue = premGrownValueRs / product.mobilization;
  const premiumRate = product.premDiscRate;

  // Group counts for Calculator premium split (COUNTIFS on Options+Strike+Spreads)
  const groupKey = (o: string, k: number, s: number) => `${o}|${k}|${s}`;
  // Qty-driven books (Main Master) ignore blank / zero Required Quantity filler rows.
  // Without this, a zero-qty leg would still leak into Calculator premium via spreads.
  const qtyDriven = product.legs.some(
    (l) => l.reqQuantity != null && Number.isFinite(l.reqQuantity) && l.reqQuantity !== 0,
  );
  const liveLegs = qtyDriven
    ? product.legs.filter(
        (l) => l.reqQuantity != null && Number.isFinite(l.reqQuantity) && l.reqQuantity !== 0,
      )
    : product.legs;

  const groupCounts = new Map<string, number>();
  for (const leg of liveLegs) {
    const key = groupKey(String(leg.optionType), leg.strike, leg.spreads);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  const optionRows: OptionTableRow[] = [];

  for (const leg of liveLegs) {
    const priced = priceLeg({
      leg,
      spot,
      valuationDate: unwindDate,
      surface,
      bidAskSpread,
      underlying,
    });
    const mark = unwindMarkPrice(priced, String(leg.originalSide));
    const mid = priced.price;

    const original = String(leg.originalSide);
    const unwind = flipSide(original);
    const reqQty = leg.reqQuantity ?? 0;

    // Display quantity tracks Required Quantity on the Product Master, scaled to the
    // typed holding. Same strike / spreads / side therefore share one quantity across
    // expiries — the input book split of /4, not the old per-leg qtyDivisor path.
    let quantity: number;
    if (reqQty !== 0 && totalDebs > 0) {
      quantity = reqQty * (dens / totalDebs);
    } else {
      const level = resolveContingentLevel(product);
      const divisor = Math.max(leg.qtyDivisor ?? 1, 1);
      const baseAbs = Math.round(((leg.spreads * dens * face) / level) * 100) / 100 / divisor;
      quantity = original.toLowerCase() === "sell" ? -baseAbs : baseAbs;
    }

    // Live: Unwind Buy → Pricer Buy Price, Unwind Sell → Pricer Sell Price.
    // Expired: the same in-the-money price for Unwind Buy and Unwind Sell.
    // Put is max(strike − spot, 0). Call is max(spot − strike, 0).
    // The sign is applied only in the cash: original Sell pays, original Buy receives.
    // Pricer table stays Excel IFERROR → 0.
    const expired = daysBetween(unwindDate, parseISODate(leg.expiry)) <= 0;
    const isCall = String(leg.optionType).toLowerCase().startsWith("c");
    const settlementSpot = expired
      ? spotForExpiredSellPut(legExpiryYmd(leg.expiry), spot, inputs.expirySpots)
      : spot;
    const intrinsic = expired ? expiredIntrinsicMark(settlementSpot, leg.strike, isCall) : null;
    const bookMark = intrinsic ?? mark;
    const unwindPrice = intrinsic != null ? intrinsic : signedUnwindPrice(bookMark, unwind);
    // Cash uses the Unwind Quantity on this row, so price × quantity is the amount,
    // and the sum of the amounts is the net Premium Outflow.
    const premiumOutflowRs = roundDeskMoney(bookMark * quantity);
    const masterPrice = leg.prdPrice ?? product.prdPrice;
    // Product Premium Amount stays on Required Quantity (Main Master / XLSM parity).
    const prdPremium = roundDeskMoney(masterPrice * -reqQty);
    const premiumPerSpread =
      Number.isFinite(masterPrice) && Math.abs(masterPrice) > PRICE_BLANK_EPS
        ? roundDeskMoney(Math.abs(masterPrice))
        : null;

    // Headline Current Premium Outflow: live mids plus expired intrinsic on both sides.
    const showPrice = expired || mid > PRICE_BLANK_EPS;
    const currentPrice = intrinsic != null && intrinsic > 0 ? intrinsic : showPrice ? mid : null;
    let premiumCell: number | null = null;
    if (!expired && showPrice && mid > PRICE_BLANK_EPS) {
      const count = groupCounts.get(groupKey(String(leg.optionType), leg.strike, leg.spreads)) ?? 1;
      const signed = unwind.toLowerCase() === "sell" ? mid * leg.spreads : -mid * leg.spreads;
      premiumCell = signed / count;
    } else if (intrinsic != null && intrinsic > 0) {
      const count = groupCounts.get(groupKey(String(leg.optionType), leg.strike, leg.spreads)) ?? 1;
      // Original Sell pays. Original Buy receives.
      const signed = original.trim().toLowerCase() === "sell" ? -intrinsic : intrinsic;
      premiumCell = (signed * leg.spreads) / count;
    } else if (showPrice && expired) {
      premiumCell = 0;
    }

    optionRows.push({
      options: String(leg.optionType),
      strike: leg.strike,
      spreads: leg.spreads,
      original,
      unwind,
      expiry: leg.expiry,
      quantity,
      currentPrice,
      premium: premiumCell,
      premiumPerSpread,
      sdCode: leg.sdCode ?? priced.code,
      unwindAction: unwind,
      prdPremium,
      unwindPrice,
      premiumOutflowRs,
      expired,
    });
  }

  const premSum = optionRows.reduce((s, r) => s + (r.premium ?? 0), 0);
  const contingentLevel = resolveContingentLevel(product);
  const currentPremOutflowPct = premSum / contingentLevel;

  const marginResidual = product.marginCost * (residual / Math.max(tenor, 1));
  const pricerUnwindValue =
    nbfcGrownValue + premiumGrownValue + currentPremOutflowPct + marginResidual;

  const unwindQuotePct = pricerUnwindValue;
  const unwindQuoteRs = face * unwindQuotePct;

  const grownRounded = roundDeskMoney(grownValueRs);
  const premGrownRounded = roundDeskMoney(premGrownValueRs);
  const outflowRounded = roundDeskMoney(
    optionRows.reduce((sum, row) => sum + row.premiumOutflowRs, 0),
  );
  const unwindValueRs = roundDeskMoney(grownRounded + premGrownRounded + outflowRounded);
  const masterEconomics: MasterEconomics = {
    premiumCreditedRs: roundDeskMoney(premiumCreditedRs),
    premiumOutflowRs: outflowRounded,
    amtWithNbfcRs: roundDeskMoney(amtWithNbfcRs),
    grownValueRs: grownRounded,
    premGrownValueRs: premGrownRounded,
    unwindValueRs,
    unwindQuoteRs: roundDeskMoney(unwindValueRs / totalDebs),
  };

  const productIRR = rateZeroCoupon(tenor / 365, face, face * (1 + product.coupon));
  const clientIRR = rateZeroCoupon(invested / 365, face, unwindQuoteRs);
  const residualIRR = rateZeroCoupon(residual / 365, unwindQuoteRs, face * (1 + product.coupon));

  return {
    productName: product.productName,
    productCode: product.productCode,
    debentures: dens,
    faceValue: face,
    inbuilt: product.inbuilt,
    tranCost: product.tranCost,
    issuanceCost: product.issuanceCost,
    marginCost: product.marginCost,
    initialNiftyLevel: product.initialNiftyLevel,
    contingentLevel,
    deltaDate: product.deltaDate,
    allotmentDate: product.allotmentDate,
    unwindDate: inputs.unwindDate,
    underlying: inputs.underlying || "",
    contingentCoupon: product.coupon,
    tenorDays: tenor,
    residualTenor: residual,
    maturityDate: product.maturityDate,
    spot,

    unwindQuotePct,
    unwindQuoteRs,
    productIRR,
    clientIRR,
    residualIRR,

    totalDebs,
    amountWithNbfc,
    discountingRate: product.prdDiscRate,
    nbfcGrownValue,
    premium: premiumFraction,
    premiumRate,
    premiumGrownValue,
    investedTenorDays: invested,
    currentPremOutflowPct,
    pricerUnwindValue,
    bidAskSpread,

    masterEconomics,
    optionRows,
  };
}
