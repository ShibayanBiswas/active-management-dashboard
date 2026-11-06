import { blackScholesDelta, blackScholesPrice } from "@/lib/engine/black-scholes";
import type { FixingLookup } from "@/lib/engine/fixings";
import { interpolateVolPercent } from "@/lib/engine/vol-surface";
import { daysBetween } from "@/lib/dates";
import type { BidAskPoint, ChainRow, DeskInputs, Leg, OptionChain, OptionType, Side, VolSurface } from "@/lib/types";

/** One price per Strike x Expiry x Option x Side; every leg sharing the key reuses it. */
export function pricingKey(leg: Pick<Leg, "strike" | "expiry" | "optionType" | "side">): string {
  return `${leg.strike}|${leg.expiry}|${leg.optionType}|${leg.side}`;
}

export type PricedKey = {
  key: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  side: Side;
  expired: boolean;
  /** Nifty close on expiry for expired keys. */
  fixing: number | null;
  surfaceVol: number | null;
  spread: number | null;
  /** Surface vol plus the spread for an original Sell, minus it for a Buy. */
  modelVol: number | null;
  price: number;
  delta: number;
  marketBid: number | null;
  marketAsk: number | null;
  /** Ask for an original Sell (buy back), bid for a Buy. */
  marketPrice: number | null;
};

function intrinsic(optionType: OptionType, strike: number, level: number): number {
  return optionType === "Call" ? Math.max(0, level - strike) : Math.max(0, strike - level);
}

/** Spread for the first surface expiry on or after the leg expiry (the table lists every monthly expiry). */
function spreadFor(bidAsk: BidAskPoint[], expiry: string): number {
  if (!bidAsk.length) return 0;
  const sorted = [...bidAsk].sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
  const exact = sorted.find((p) => p.expiry === expiry);
  if (exact) return exact.spread;
  return (sorted.find((p) => p.expiry >= expiry) ?? sorted[sorted.length - 1]).spread;
}

function chainForExpiry(chains: OptionChain[], expiry: string): OptionChain | null {
  return chains.find((c) => c.expiry === expiry) ?? chains.find((c) => c.month === expiry.slice(0, 7)) ?? null;
}

/** Linear in strike between the bracketing listed strikes; null outside the listed range. */
function interpolateChain(rows: ChainRow[], strike: number, pick: (row: ChainRow) => number | null): number | null {
  const pts = rows
    .map((r) => ({ x: r.strike, y: pick(r) }))
    .filter((p): p is { x: number; y: number } => p.y != null && Number.isFinite(p.y) && p.y > 0)
    .sort((a, b) => a.x - b.x);
  if (!pts.length || strike < pts[0].x || strike > pts[pts.length - 1].x) return null;
  for (let i = 0; i < pts.length; i += 1) {
    if (pts[i].x === strike) return pts[i].y;
    if (pts[i].x > strike) {
      const a = pts[i - 1];
      const b = pts[i];
      return a.y + ((strike - a.x) / (b.x - a.x)) * (b.y - a.y);
    }
  }
  return null;
}

export type PricingContext = {
  inputs: Pick<DeskInputs, "valuationDate" | "currentNifty" | "forwardRate" | "discountSpread" | "deltaRate">;
  surface: VolSurface;
  bidAsk: BidAskPoint[];
  chains: OptionChain[];
  lookup: FixingLookup;
};

export function priceKey(leg: Pick<Leg, "strike" | "expiry" | "optionType" | "side">, ctx: PricingContext): PricedKey {
  const { inputs } = ctx;
  const key = pricingKey(leg);
  const isCall = leg.optionType === "Call";
  const chain = chainForExpiry(ctx.chains, leg.expiry);
  const marketBid = chain ? interpolateChain(chain.rows, leg.strike, (r) => (isCall ? r.callBid : r.putBid)) : null;
  const marketAsk = chain ? interpolateChain(chain.rows, leg.strike, (r) => (isCall ? r.callAsk : r.putAsk)) : null;
  const base = { key, optionType: leg.optionType, strike: leg.strike, expiry: leg.expiry, side: leg.side, marketBid, marketAsk, marketPrice: leg.side === "Sell" ? marketAsk : marketBid };
  if (leg.expiry <= inputs.valuationDate) {
    const fixing = ctx.lookup(leg.expiry);
    return { ...base, expired: true, fixing, surfaceVol: null, spread: null, modelVol: null, price: fixing == null ? 0 : intrinsic(leg.optionType, leg.strike, fixing), delta: 0 };
  }
  const tau = daysBetween(inputs.valuationDate, leg.expiry) / 365;
  const surfaceVol = interpolateVolPercent(ctx.surface, leg.strike, leg.expiry) / 100;
  const spread = spreadFor(ctx.bidAsk, leg.expiry);
  const modelVol = Math.max(0, leg.side === "Sell" ? surfaceVol + spread : surfaceVol - spread);
  const price = blackScholesPrice({
    spot: inputs.currentNifty,
    strike: leg.strike,
    tauYears: tau,
    forwardGrowth: inputs.forwardRate,
    discountYield: inputs.forwardRate + inputs.discountSpread,
    vol: modelVol,
    isCall,
  });
  const delta = blackScholesDelta({
    spot: inputs.currentNifty,
    strike: leg.strike,
    tauYears: tau,
    forwardGrowth: inputs.deltaRate,
    discountYield: inputs.deltaRate,
    vol: modelVol,
    isCall,
  });
  return { ...base, expired: false, fixing: null, surfaceVol, spread, modelVol, price, delta };
}

/** Price of a priced key with Nifty at level. Expired keys keep their settled value. */
export function priceAtLevel(p: PricedKey, level: number, mode: "delta" | "full", ctx: PricingContext): number {
  if (p.expired) return p.price;
  if (mode === "delta") return Math.max(0, p.price + (level - ctx.inputs.currentNifty) * p.delta);
  return blackScholesPrice({
    spot: level,
    strike: p.strike,
    tauYears: daysBetween(ctx.inputs.valuationDate, p.expiry) / 365,
    forwardGrowth: ctx.inputs.forwardRate,
    discountYield: ctx.inputs.forwardRate + ctx.inputs.discountSpread,
    vol: p.modelVol ?? 0,
    isCall: p.optionType === "Call",
  });
}
