import { blackScholesDelta, blackScholesPrice } from "@/lib/engine/black-scholes";
import { surfaceVolDecimal } from "@/lib/engine/vol-surface";
import type { OptionLeg, PricerRow, ProductMaster, UnderlyingIndex, VolSurface } from "@/lib/types";
import {
  daysBetween,
  parseISODate,
  roundDeskMoney,
  toSerialDay,
  underlyingFromProductName,
} from "@/lib/utils";

export function optionCode(kind: string, expiry: Date, strike: number): string {
  const letter = String(kind).trim().toUpperCase().startsWith("C") ? "C" : "P";
  return `${letter}${toSerialDay(expiry)}${Math.round(strike)}`;
}

/**
 * Price one option leg for a pricer row.
 * The discount yield is the leg's Forward Sell Rate plus one percent (pricer convention).
 * bidAskSpread z (default 0): Sell price uses σ − z/2, Buy price uses σ + z/2.
 *
 * Expired legs (τ ≤ 0, including expiries absent from the live vol surface): Price, Sell
 * and Buy are 0. Excel’s Black–Scholes cell errors once time has run out, and the Main
 * Master lookup turns that error into 0. Implied Volatility, Volatility Bump, Forward
 * Growth, Discount Yield and Bid Offer are forced to 0 — there is no live surface mark.
 */
export function priceLeg(args: {
  leg: OptionLeg;
  spot: number;
  valuationDate: Date;
  surface: VolSurface;
  bidAskSpread?: number;
  underlying?: UnderlyingIndex;
}): PricerRow {
  const { leg, spot, valuationDate, surface } = args;
  const bidAsk = args.bidAskSpread ?? 0;
  const maturity = parseISODate(leg.expiry);
  const tauDays = daysBetween(valuationDate, maturity);
  const tauYears = tauDays / 365;
  const isCall = String(leg.optionType).toLowerCase().startsWith("c");
  const expired = tauYears <= 0;

  // Expired / passed observation: Excel’s Black–Scholes cell errors (divide by √τ).
  // The Main Master IFERROR lookup stores 0 for sell and buy, calls and puts alike.
  if (expired) {
    return {
      code: leg.sdCode || optionCode(leg.optionType, maturity, leg.strike),
      strike: leg.strike,
      maturity: maturity.toISOString(),
      valuationDate: valuationDate.toISOString(),
      optionType: String(leg.optionType),
      spot,
      forwardGrowth: 0,
      discountYield: 0,
      volatility: 0,
      volBump: 0,
      bidOffer: 0,
      price: 0,
      sellPrice: 0,
      buyPrice: 0,
      delta: 0,
      expired: true,
    };
  }

  const { volBump, vol, fwd } = surfaceVolDecimal(
    surface,
    leg.strike,
    maturity,
    spot,
    args.underlying ?? "Nifty",
  );
  const discountYield = fwd + 0.01;

  const base = {
    spot,
    strike: leg.strike,
    tauYears,
    forwardGrowth: fwd,
    discountYield,
    vol,
    isCall,
  };

  // Black–Scholes mid/sides, then ROUND to two decimals like Excel currency cells.
  // Outflow and the Options Book use these rounded marks — never raw float noise.
  // Non-finite / error paths match Excel IFERROR → 0.
  const midRaw = blackScholesPrice(base);
  const sellRaw = blackScholesPrice({ ...base, vol: Math.max(vol - bidAsk / 2, 1e-8) });
  const buyRaw = blackScholesPrice({ ...base, vol: vol + bidAsk / 2 });
  const price = roundDeskMoney(Number.isFinite(midRaw) ? midRaw : 0);
  const sellPrice = roundDeskMoney(Number.isFinite(sellRaw) ? sellRaw : 0);
  const buyPrice = roundDeskMoney(Number.isFinite(buyRaw) ? buyRaw : 0);
  const deltaRaw = blackScholesDelta(base);
  const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;

  return {
    code: leg.sdCode || optionCode(leg.optionType, maturity, leg.strike),
    strike: leg.strike,
    maturity: maturity.toISOString(),
    valuationDate: valuationDate.toISOString(),
    optionType: String(leg.optionType),
    spot,
    forwardGrowth: fwd,
    discountYield,
    volatility: vol,
    volBump,
    bidOffer: bidAsk,
    price,
    sellPrice,
    buyPrice,
    delta,
    expired: false,
  };
}

export function priceProductBook(args: {
  product: ProductMaster;
  spot: number;
  valuationDate: string;
  surface: VolSurface;
  bidAskSpread?: number;
  underlying?: UnderlyingIndex;
}): PricerRow[] {
  const vd = parseISODate(args.valuationDate);
  const underlying =
    args.underlying ?? underlyingFromProductName(args.product.productName, args.product.productCode);
  const legs = args.product.legs;
  const qtyDriven = legs.some(
    (l) => l.reqQuantity != null && Number.isFinite(l.reqQuantity) && l.reqQuantity !== 0,
  );
  const liveLegs = qtyDriven
    ? legs.filter(
        (l) => l.reqQuantity != null && Number.isFinite(l.reqQuantity) && l.reqQuantity !== 0,
      )
    : legs;
  return liveLegs.map((leg) =>
    priceLeg({
      leg,
      spot: args.spot,
      valuationDate: vd,
      surface: args.surface,
      bidAskSpread: args.bidAskSpread,
      underlying,
    }),
  );
}

/** Master Unwind Prices: Unwind Action Buy → Buy price (col AA); Sell → Sell price (col Z). */
export function unwindMarkPrice(row: PricerRow, originalSide: string): number {
  const side = originalSide.trim().toLowerCase();
  if (side === "sell") return row.buyPrice;
  return row.sellPrice;
}
