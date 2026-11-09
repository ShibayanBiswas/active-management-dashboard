import type { PricingParamPoint, UnderlyingIndex, VolSurface } from "@/lib/types";
import { deskTodayISO, parseISODate } from "@/lib/utils";

import volSeed from "@/lib/data/vol-surface-seed.json";

/** Deep column is always ₹500 for Nifty and Sensex. Not read from the workbook. */
export const DEEP_STRIKE = 500;

/** Default surface month when no desk upload exists: the month of the baked seed. */
export const DEFAULT_SURFACE_MONTH_KEY: string = volSeed.monthKey;

/**
 * First calendar day of the default surface month.
 * These closes are the **vol-surface 100% strike anchors** baked into the monthly
 * surface seed / upload — not live pricing spots. Live Nifty/Sensex marks always
 * come from Yahoo via `resolveDeskSpots` / `resolveExpirySpots`.
 */
export const MONTHLY_REFERENCE_AS_OF = `${DEFAULT_SURFACE_MONTH_KEY}-01`;

/** Nifty close as of MONTHLY_REFERENCE_AS_OF — the seed's 100% anchor (`npm run bake:vol`). */
export const MONTHLY_REFERENCE_NIFTY: number = volSeed.referenceUnderlyingPrice;

/** Sensex close as of MONTHLY_REFERENCE_AS_OF — the seed's 100% anchor (`npm run bake:vol`). */
export const MONTHLY_REFERENCE_SENSEX: number = volSeed.referenceSensexPrice;

/** @deprecated Use MONTHLY_REFERENCE_AS_OF — kept for existing imports. */
export const AUGUST_REFERENCE_AS_OF = MONTHLY_REFERENCE_AS_OF;
/** @deprecated Use MONTHLY_REFERENCE_NIFTY */
export const AUGUST_REFERENCE_UNDERLYING_PRICE = MONTHLY_REFERENCE_NIFTY;
/** @deprecated Use MONTHLY_REFERENCE_SENSEX */
export const AUGUST_REFERENCE_SENSEX_PRICE = MONTHLY_REFERENCE_SENSEX;

/** Forward Sell Rate of the baked seed: the fallback when a surface carries no Pricing Params point. */
export const DEFAULT_FWD_SELL_RATE: number = volSeed.pricingParams[0]?.fwdSellRate ?? 0;

/** Rupee strike row decimals for Nifty and Sensex on the vol grid (match index close precision). */
export const INDEX_STRIKE_PRICE_DECIMALS = 2;

function isPositiveRef(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** The surface's own 100% anchors; a missing one falls back to the live spot at use. */
function resolvedReferenceUnderlyingPrice(surface: VolSurface): number | undefined {
  const ref = Number(surface.referenceUnderlyingPrice);
  return isPositiveRef(ref) ? ref : undefined;
}

function resolvedReferenceSensexPrice(surface: VolSurface): number | undefined {
  const ref = Number(surface.referenceSensexPrice);
  return isPositiveRef(ref) ? ref : undefined;
}

/** "October 2026 Volatility Surface" for a YYYY-MM key. */
export function surfaceMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const monthName = new Date(Date.UTC(year || 2026, (month || 1) - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });
  return `${monthName} ${year} Volatility Surface`;
}

/**
 * The desk shows the current calendar month.
 * If that month has no uploaded surface, the previous month's vol grid continues,
 * and the name plus reference prices move to the current month.
 */
export function labelSurfaceForDeskMonth(
  surface: VolSurface,
  todayMonth: string,
  anchors?: { nifty?: number | null; sensex?: number | null },
): VolSurface {
  if (!/^\d{4}-\d{2}$/.test(todayMonth) || surface.monthKey >= todayMonth) return surface;
  const nifty = Number(anchors?.nifty);
  const sensex = Number(anchors?.sensex);
  return normalizeVolSurface({
    ...surface,
    monthKey: todayMonth,
    label: surfaceMonthLabel(todayMonth),
    referenceUnderlyingPrice: nifty > 0 ? nifty : surface.referenceUnderlyingPrice,
    referenceSensexPrice: sensex > 0 ? sensex : surface.referenceSensexPrice,
  });
}

/** 100% Strike Change Nifty anchor from Surface Parameters. */
export function referenceUnderlyingPrice(surface: VolSurface, liveSpot?: number): number {
  const stored = resolvedReferenceUnderlyingPrice(surface);
  if (stored != null) return stored;
  const live = Number(liveSpot);
  if (Number.isFinite(live) && live > 0) return live;
  return 0;
}

/** 100% Strike Change Sensex anchor. */
export function referenceSensexPrice(surface: VolSurface, liveSpot?: number): number {
  const stored = resolvedReferenceSensexPrice(surface);
  if (stored != null) return stored;
  const live = Number(liveSpot);
  if (Number.isFinite(live) && live > 0) return live;
  return 0;
}

/** Moneyness anchor for the named index. Nifty and Sensex share the percent grid. */
export function referencePriceForUnderlying(
  surface: VolSurface,
  underlying: UnderlyingIndex = "Nifty",
  liveSpot?: number,
): number {
  return underlying === "Sensex"
    ? referenceSensexPrice(surface, liveSpot)
    : referenceUnderlyingPrice(surface, liveSpot);
}

function clampIndex(i: number, n: number): number {
  return Math.max(0, Math.min(n - 1, i));
}

/** Linear interpolate y at x given sorted xs. */
export function interp1(xs: number[], ys: number[], x: number): number {
  const n = Math.min(xs.length, ys.length);
  if (n <= 0) return 0;
  const y0 = Number(ys[0]);
  if (n === 1 || x <= xs[0]) return Number.isFinite(y0) ? y0 : 0;
  const yLast = Number(ys[n - 1]);
  if (x >= xs[n - 1]) return Number.isFinite(yLast) ? yLast : 0;
  let i = 0;
  while (i < n - 1 && xs[i + 1] < x) i += 1;
  const x0 = xs[i];
  const x1 = xs[i + 1];
  const a = Number(ys[i]);
  const b = Number(ys[i + 1]);
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : 0;
  if (!Number.isFinite(b) || x1 === x0) return a;
  const t = (x - x0) / (x1 - x0);
  const v = a + t * (b - a);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Normalised grid per surface object. interpolateVolPercent normalises on every leg, which was
 * about 97% of an unwind. Surfaces are treated as immutable: edits clone first (cloneSurface in
 * the surface editor), so a cached grid can never go stale. The output maps to itself.
 */
const NORMALIZED = new WeakMap<VolSurface, VolSurface>();

/** Sort expiries and strike-percent columns so bilinear lookup stays correct after edits. */
export function normalizeVolSurface(surface: VolSurface): VolSurface {
  const hit = NORMALIZED.get(surface);
  if (hit) return hit;
  const out = normalizeVolSurfaceUncached(surface);
  NORMALIZED.set(surface, out);
  NORMALIZED.set(out, out);
  return out;
}

function normalizeVolSurfaceUncached(surface: VolSurface): VolSurface {
  const expiryPairs = surface.expiries
    .map((expiry, i) => ({ expiry, vols: [...(surface.volsPercent[i] ?? [])] }))
    .filter((row) => Number.isFinite(parseISODate(row.expiry).getTime()))
    .sort((a, b) => parseISODate(a.expiry).getTime() - parseISODate(b.expiry).getTime());

  const moneyIdx = (surface.moneyness ?? [])
    .map((m, i) => ({ m: Number(m), i }))
    .filter((x) => Number.isFinite(x.m) && x.m > 0)
    .sort((a, b) => a.m - b.m);

  const absoluteStrikeIdx = (surface.strikes ?? [])
    .map((s, i) => ({ s: Number(s), i }))
    .filter((x) => Number.isFinite(x.s) && x.s > 0)
    .sort((a, b) => a.s - b.s);

  const useAbsoluteStrikes = moneyIdx.length === 0 && absoluteStrikeIdx.length > 1;
  const moneyness = useAbsoluteStrikes ? [] : moneyIdx.map((x) => x.m);
  const volsPercent = expiryPairs.map((row) => {
    if (useAbsoluteStrikes) {
      return absoluteStrikeIdx.map((x) => {
        const v = Number(row.vols[x.i]);
        return Number.isFinite(v) ? v : 0;
      });
    }
    const deep = Number(row.vols[0]);
    return [
      Number.isFinite(deep) ? deep : 0,
      ...moneyIdx.map((x) => {
        const v = Number(row.vols[x.i + 1]);
        return Number.isFinite(v) ? v : 0;
      }),
    ];
  });
  const strikes = useAbsoluteStrikes
    ? absoluteStrikeIdx.map((x) => x.s)
    : [DEEP_STRIKE, ...moneyness];

  const params = (surface.pricingParams ?? []).map((p) => ({
    date: p.date,
    volBump: Number.isFinite(p.volBump) ? p.volBump : 0,
    fwdSellRate: Number.isFinite(p.fwdSellRate) && p.fwdSellRate > 0 ? p.fwdSellRate : DEFAULT_FWD_SELL_RATE,
  }));

  const now = new Date();
  const monthKey =
    typeof surface.monthKey === "string" && /^\d{4}-\d{2}$/.test(surface.monthKey)
      ? surface.monthKey
      : deskTodayISO(now).slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const monthName = new Date(Date.UTC(year || now.getFullYear(), (month || 1) - 1, 1)).toLocaleString(
    "en-IN",
    { month: "long", timeZone: "UTC" },
  );

  const withMonth = { ...surface, monthKey };
  return {
    monthKey,
    label: surface.label?.trim() || `${monthName} ${year} Volatility Surface`,
    deepStrike: DEEP_STRIKE,
    moneyness,
    strikes,
    expiries: expiryPairs.map((row) => row.expiry),
    volsPercent,
    pricingParams: params.length
      ? params
      : [{ date: expiryPairs[0]?.expiry ?? now.toISOString(), volBump: 0, fwdSellRate: DEFAULT_FWD_SELL_RATE }],
    referenceUnderlyingPrice: resolvedReferenceUnderlyingPrice(withMonth),
    referenceSensexPrice: resolvedReferenceSensexPrice(withMonth),
    bidAskSpread: surface.bidAskSpread,
  };
}

/** Find bracketing expiry indices for bilinear vol lookup. */
function expiryBracket(expiries: Date[], target: Date): [number, number, number] {
  const t = target.getTime();
  const times = expiries.map((d) => d.getTime());
  if (t <= times[0]) return [0, 0, 0];
  if (t >= times[times.length - 1]) {
    const last = times.length - 1;
    return [last, last, 0];
  }
  let i = 0;
  while (i < times.length - 1 && times[i + 1] < t) i += 1;
  const t0 = times[i];
  const t1 = times[i + 1];
  const w = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return [i, i + 1, w];
}

/**
 * Deep column is always ₹500. Remaining columns are moneyness × the named index
 * reference price (100% anchor). Nifty uses Reference Nifty Price; Sensex uses
 * Reference Sensex Price.
 */
export function moneynessStrikes(
  surface: VolSurface,
  spot?: number,
  underlying: UnderlyingIndex = "Nifty",
): number[] {
  if (!surface.moneyness?.length) {
    return surface.strikes.map(Number);
  }
  const anchor = referencePriceForUnderlying(surface, underlying, spot);
  return [DEEP_STRIKE, ...surface.moneyness.map((m) => m * anchor)];
}

/**
 * Interpolate vol (%) from the moneyness grid for (strike, expiry).
 * Strike columns are Deep = 500 and percent-of-reference for the named index.
 */
export function interpolateVolPercent(
  surface: VolSurface,
  strike: number,
  expiry: Date,
  spot?: number,
  underlying: UnderlyingIndex = "Nifty",
): number {
  const grid = normalizeVolSurface(surface);
  if (!grid.expiries.length) return 0;
  const expiries = grid.expiries.map(parseISODate);
  const strikes = moneynessStrikes(grid, spot ?? 0, underlying);
  const [i0, i1, wT] = expiryBracket(expiries, expiry);

  const rowVol = (row: number[]) => interp1(strikes, row.map(Number), strike);

  const v0 = rowVol(grid.volsPercent[i0] ?? []);
  const v1 = rowVol(grid.volsPercent[i1] ?? []);
  const v = v0 + wT * (v1 - v0);
  return Number.isFinite(v) ? v : 0;
}

/** Lookup vol bump (Pricing Params BID) by maturity — MATCH(...,1) style. */
export function lookupVolBump(params: PricingParamPoint[], maturity: Date): number {
  if (!params.length) return 0;
  const sorted = [...params].sort((a, b) => parseISODate(a.date).getTime() - parseISODate(b.date).getTime());
  let chosen = sorted[0];
  for (const p of sorted) {
    if (parseISODate(p.date).getTime() <= maturity.getTime()) chosen = p;
    else break;
  }
  return chosen.volBump;
}

/** Lookup / interpolate forward sell rate by maturity. */
export function lookupFwdSellRate(params: PricingParamPoint[], maturity: Date): number {
  if (!params.length) return DEFAULT_FWD_SELL_RATE;
  const sorted = [...params].sort((a, b) => parseISODate(a.date).getTime() - parseISODate(b.date).getTime());
  const xs = sorted.map((p) => parseISODate(p.date).getTime());
  const ys = sorted.map((p) => p.fwdSellRate);
  return interp1(xs, ys, maturity.getTime());
}

export function surfaceVolDecimal(
  surface: VolSurface,
  strike: number,
  expiry: Date,
  spot?: number,
  underlying: UnderlyingIndex = "Nifty",
): { rawPct: number; volBump: number; vol: number; fwd: number } {
  const rawPct = interpolateVolPercent(surface, strike, expiry, spot, underlying);
  const volBump = lookupVolBump(surface.pricingParams, expiry);
  const fwd = lookupFwdSellRate(surface.pricingParams, expiry);
  // Surface vols are percent points (13.39); divide by 100 then add the
  // Vol Bump, which is an absolute addition to the vol decimal.
  const vol = (Number.isFinite(rawPct) ? rawPct / 100 : 0) + (Number.isFinite(volBump) ? volBump : 0);
  return { rawPct: Number.isFinite(rawPct) ? rawPct : 0, volBump, vol, fwd: Number.isFinite(fwd) ? fwd : DEFAULT_FWD_SELL_RATE };
}

export function assertSurface(surface: VolSurface): void {
  void clampIndex;
  if (!surface.expiries.length || !surface.strikes.length) {
    throw new Error("Vol surface is empty");
  }
}
