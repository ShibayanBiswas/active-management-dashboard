import fs from "node:fs";

import { parseVolSurfaceWorkbook } from "../lib/workbook/parsers";
import { volSurfaceSampleFileName } from "../lib/workbook/upload-schema";
import { formatDeskDate, formatDeskDateFull } from "../lib/utils";
import volSeed from "../lib/data/vol-surface-seed.json";
import type { VolSurface } from "../lib/types";

/** October 2026 seed from Vol Surface for Oct26.xlsx. */
const LIVE_EXPIRIES = [
  "27-Oct-26",
  "23-Nov-26",
  "29-Dec-26",
  "30-Mar-27",
  "29-Jun-27",
  "28-Sep-27",
  "28-Dec-27",
  "28-Mar-28",
  "27-Jun-28",
  "26-Dec-28",
  "26-Jun-29",
  "24-Dec-29",
  "29-Dec-30",
  "26-Mar-31",
];
const MONTH_KEY = "2026-10";
const REFERENCE_NIFTY = 22421.95;
const REFERENCE_SENSEX = 71909.7;

function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function toBuffer(file: Buffer): ArrayBuffer {
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

function checkSurface(label: string, surface: Pick<VolSurface, "expiries" | "volsPercent"> & Partial<VolSurface>) {
  assert(`${label} count`, surface.expiries.length === LIVE_EXPIRIES.length, `${surface.expiries.length}`);
  const shown = surface.expiries.map((d) => formatDeskDate(d));
  for (let i = 0; i < LIVE_EXPIRIES.length; i++) {
    assert(`${label} [${i}] ${LIVE_EXPIRIES[i]}`, shown[i] === LIVE_EXPIRIES[i], shown[i]);
  }
  assert(
    `${label} Deep · ₹500 equals 55% on every expiry`,
    surface.volsPercent.length === LIVE_EXPIRIES.length && surface.volsPercent.every((row) => row[0] === row[1]),
  );
  if (surface.pricingParams) {
    assert(
      `${label} Forward Sell Rate 6.6%`,
      Math.abs((surface.pricingParams[0]?.fwdSellRate ?? 0) - 0.066) < 1e-9,
      String(surface.pricingParams[0]?.fwdSellRate),
    );
  }
  if (surface.referenceUnderlyingPrice != null) {
    assert(
      `${label} Reference Nifty ${REFERENCE_NIFTY}`,
      Math.abs(surface.referenceUnderlyingPrice - REFERENCE_NIFTY) < 1e-6,
      String(surface.referenceUnderlyingPrice),
    );
  }
  if (surface.referenceSensexPrice != null) {
    assert(
      `${label} Reference Sensex ${REFERENCE_SENSEX}`,
      Math.abs(surface.referenceSensexPrice - REFERENCE_SENSEX) < 1e-6,
      String(surface.referenceSensexPrice),
    );
  }
  console.log(`${label} full-year`, surface.expiries.map((d) => formatDeskDateFull(d)).join(" | "));
}

async function maybeLive() {
  try {
    const res = await fetch("http://localhost:3006/api/multi/dataset");
    if (!res.ok) return;
    const data = (await res.json()) as { surface?: VolSurface };
    if (data.surface) checkSurface("live /api/multi/dataset", data.surface);
  } catch {
    console.log("SKIP live dataset: dev server not on 3006");
  }
}

async function main() {
  assert("seed month", volSeed.monthKey === MONTH_KEY, volSeed.monthKey);
  checkSurface("seed json", volSeed as VolSurface);

  const publicSeed = JSON.parse(fs.readFileSync("public/data/vol-surface-seed.json", "utf8")) as VolSurface;
  checkSurface("public seed json", publicSeed);

  const sampleName = volSurfaceSampleFileName();
  assert("sample is named for the seed month", sampleName === "Vol_Surface_Input_October.xlsx", sampleName);
  const sample = fs.readFileSync(`public/samples/${sampleName}`);
  checkSurface("sample workbook", parseVolSurfaceWorkbook(toBuffer(sample), MONTH_KEY));

  await maybeLive();
  if (process.exitCode) process.exit(process.exitCode);
  console.log("All October vol surface checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
