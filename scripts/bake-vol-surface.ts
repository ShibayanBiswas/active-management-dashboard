/**
 * Bake the monthly vol-surface seed from a desk surface grid.
 *
 *   npm run bake:vol -- "<path to surface .xlsx>" <YYYY-MM>
 *
 * The grid has one header row of Strike Change percents (55 … 150) and one row per
 * expiry (Excel date, then a vol in percent points per strike). The Deep · ₹500 column
 * takes the 55% vols. Expiries already passed on the IST calendar are dropped.
 * Forward Sell Rate and Volatility Bump carry over from the current seed. The 100% Nifty
 * and Sensex anchors are the Yahoo closes on the first session of the month.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

import currentSeed from "../lib/data/vol-surface-seed.json";
import { fetchIndexAtDate } from "../lib/market-data";
import { DEEP_STRIKE, normalizeVolSurface, surfaceMonthLabel } from "../lib/engine/vol-surface";
import { deskTodayISO, parseISODate } from "../lib/utils";
import type { VolSurface } from "../lib/types";

const [src, monthKey] = process.argv.slice(2);
if (!src || !/^\d{4}-\d{2}$/.test(monthKey ?? "")) {
  console.error('Usage: npm run bake:vol -- "<surface.xlsx>" <YYYY-MM>');
  process.exit(1);
}
if (!fs.existsSync(src)) throw new Error(`Source workbook missing: ${src}`);

function excelDateToIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000).toISOString();
  }
  const d = parseISODate(String(value ?? "").trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function readGrid(file: string): { moneyness: number[]; expiries: string[]; vols: number[][] } {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
  // Header: the first row whose cells after column A are all percents.
  const headIdx = rows.findIndex((r) => {
    const cells = r.slice(1).filter((c) => c !== "");
    return cells.length >= 5 && cells.every((c) => typeof c === "number" && c > 1 && c <= 1000);
  });
  if (headIdx < 0) throw new Error("No Strike Change header row found (55 … 150).");
  const head = rows[headIdx]!.slice(1).filter((c) => c !== "") as number[];
  const moneyness = head.map((p) => Math.round(p * 100) / 10_000);

  const expiries: string[] = [];
  const vols: number[][] = [];
  for (const r of rows.slice(headIdx + 1)) {
    const iso = excelDateToIso(r[0]);
    if (!iso) continue;
    const row = r.slice(1, 1 + head.length).map(Number);
    if (row.length !== head.length || row.some((v) => !Number.isFinite(v))) {
      throw new Error(`Expiry ${iso.slice(0, 10)} does not have a vol for every strike.`);
    }
    expiries.push(iso);
    vols.push(row);
  }
  return { moneyness, expiries, vols };
}

async function bake(): Promise<VolSurface> {
  const grid = readGrid(src!);
  const deepFrom = grid.moneyness.findIndex((m) => Math.abs(m - 0.55) < 1e-9);
  if (deepFrom < 0) throw new Error("The grid has no 55% column for Deep · ₹500.");

  const today = deskTodayISO();
  const kept = grid.expiries
    .map((expiry, i) => ({ expiry, vols: grid.vols[i]! }))
    .filter((row) => row.expiry.slice(0, 10) >= today);
  if (!kept.length) throw new Error("No future expiries remain after dropping passed dates.");

  const levels = await fetchIndexAtDate(`${monthKey}-01`);
  if (!(levels.niftyLevel! > 0) || !(levels.sensexLevel! > 0)) {
    throw new Error(`Yahoo has no Nifty / Sensex close for ${monthKey}-01.`);
  }

  const [y, m] = monthKey!.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  const carried = (currentSeed as VolSurface).pricingParams[0]!;

  return normalizeVolSurface({
    monthKey: monthKey!,
    label: surfaceMonthLabel(monthKey!),
    deepStrike: DEEP_STRIKE,
    moneyness: grid.moneyness,
    strikes: [DEEP_STRIKE, ...grid.moneyness],
    expiries: kept.map((row) => row.expiry),
    volsPercent: kept.map((row) => [row.vols[deepFrom]!, ...row.vols]),
    pricingParams: [{ date: `${lastDay}T00:00:00.000Z`, volBump: carried.volBump, fwdSellRate: carried.fwdSellRate }],
    referenceUnderlyingPrice: levels.niftyLevel!,
    referenceSensexPrice: levels.sensexLevel!,
  });
}

async function main() {
  const surface = await bake();
  const json = `${JSON.stringify(surface, null, 2)}\n`;
  for (const rel of ["lib/data/vol-surface-seed.json", "public/data/vol-surface-seed.json"]) {
    fs.writeFileSync(path.join(process.cwd(), rel), json);
    console.log("Wrote", rel);
  }
  console.log({
    monthKey: surface.monthKey,
    label: surface.label,
    expiries: surface.expiries.length,
    firstExpiry: surface.expiries[0]?.slice(0, 10),
    lastExpiry: surface.expiries.at(-1)?.slice(0, 10),
    strikes: surface.moneyness.length,
    fwd: surface.pricingParams[0]?.fwdSellRate,
    bump: surface.pricingParams[0]?.volBump,
    refN: surface.referenceUnderlyingPrice,
    refS: surface.referenceSensexPrice,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
