import { parseISODate } from "@/lib/dates";
import type { VolSurface } from "@/lib/types";

/** Linear interpolation with flat extrapolation (Unwinding Calculator's interp1). */
function interp1(xs: number[], ys: number[], x: number): number {
  const n = Math.min(xs.length, ys.length);
  if (n <= 0) return 0;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 1 && xs[i + 1] < x) i += 1;
  const x0 = xs[i];
  const x1 = xs[i + 1];
  if (x1 === x0) return ys[i];
  return ys[i] + ((x - x0) / (x1 - x0)) * (ys[i + 1] - ys[i]);
}

export function surfaceStrikes(surface: VolSurface): number[] {
  return surface.moneyness.map((m) => m * surface.referenceLevel);
}

/**
 * Vol in percent points for (strike, expiry): linear in strike inside each expiry row, then linear in time between
 * the bracketing expiry rows. Outside the grid the nearest row or column holds flat.
 */
export function interpolateVolPercent(surface: VolSurface, strike: number, expiry: string): number {
  const rows = surface.expiries.length;
  if (!rows) return 0;
  const strikes = surfaceStrikes(surface);
  const rowVol = (i: number) => interp1(strikes, surface.volsPercent[i] ?? [], strike);
  const t = parseISODate(expiry).getTime();
  const times = surface.expiries.map((e) => parseISODate(e).getTime());
  if (t <= times[0]) return rowVol(0);
  if (t >= times[rows - 1]) return rowVol(rows - 1);
  let i = 0;
  while (i < rows - 1 && times[i + 1] <= t) i += 1;
  if (times[i] === t) return rowVol(i);
  const w = (t - times[i]) / (times[i + 1] - times[i]);
  const v0 = rowVol(i);
  return v0 + w * (rowVol(i + 1) - v0);
}
