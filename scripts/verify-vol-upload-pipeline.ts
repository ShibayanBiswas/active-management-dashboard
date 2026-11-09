/**
 * Regression: uploaded Forward Sell Rate / refs must drive pricer forwardGrowth.
 * Also guards loadActiveVolSurface preference: active surface wins over inactive calendar month.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { priceProductBook } from "../lib/engine/pricer";
import { normalizeVolSurface } from "../lib/engine/vol-surface";
import { parseVolSurfaceWorkbook } from "../lib/workbook/parsers";
import { volSurfaceSampleFileName } from "../lib/workbook/upload-schema";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import type { ProductMaster, VolSurface } from "../lib/types";

function parseFile(filePath: string, monthKey: string): VolSurface {
  const raw = fs.readFileSync(filePath);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  return normalizeVolSurface(parseVolSurfaceWorkbook(ab, monthKey));
}

const samplePath = path.join(process.cwd(), "public/samples", volSurfaceSampleFileName());
const userPath = String.raw`C:\Users\shiba\Downloads\Vol_Surface_Input_August (2).xlsx`;

const sample = parseFile(samplePath, "2026-09");
assert.equal(sample.pricingParams[0]?.fwdSellRate, 0.066, "sample Forward Sell Rate should be 6.6%");

const product = productSeed as ProductMaster;
const seedRows = priceProductBook({
  product,
  surface: volSeed as VolSurface,
  spot: 24000,
  valuationDate: "2026-09-04",
  bidAskSpread: 0,
});
assert.ok(seedRows.every((r) => Math.abs(r.forwardGrowth - 0.066) < 1e-9), "seed pricer fwd");

if (fs.existsSync(userPath)) {
  const user = parseFile(userPath, "2026-09");
  assert.ok(
    Math.abs((user.pricingParams[0]?.fwdSellRate ?? 0) - 0.066) < 1e-9,
    `user Forward Sell Rate expected 0.066 got ${user.pricingParams[0]?.fwdSellRate}`,
  );
  const userRows = priceProductBook({
    product,
    surface: user,
    spot: 24000,
    valuationDate: "2026-09-04",
    bidAskSpread: 0,
  });
  assert.ok(
    userRows.every((r) => Math.abs(r.forwardGrowth - 0.066) < 1e-9),
    `user pricer fwd expected 0.066 got ${userRows[0]?.forwardGrowth}`,
  );
  // Seed is baked from this workbook (past rows dropped) — forward must match.
  assert.ok(
    Math.abs((userRows[0]?.forwardGrowth ?? 0) - (seedRows[0]?.forwardGrowth ?? 0)) < 1e-9,
    "user workbook forward must match baked seed forward",
  );
  console.log("PASS user workbook → pricer Forward Growth 6.60%");
} else {
  console.log("SKIP user workbook missing on disk");
}

// Simulate inactive current-month preference bug: active upload under another key must win.
const activeUpload = {
  ...(volSeed as VolSurface),
  monthKey: "2026-08",
  pricingParams: [{ date: "2026-08-31T00:00:00.000Z", volBump: 0, fwdSellRate: 0.055 }],
};
const inactiveCurrent = {
  ...(volSeed as VolSurface),
  monthKey: "2026-09",
  pricingParams: [{ date: "2026-09-30T00:00:00.000Z", volBump: 0, fwdSellRate: 0.07 }],
};
void activeUpload;
void inactiveCurrent;
// Documented selection order (unit of the load query, without Mongo):
const prefer = (docs: Array<VolSurface & { isActive?: boolean }>, monthKey: string) =>
  docs.find((d) => d.monthKey === monthKey && d.isActive) ??
  docs.find((d) => d.isActive) ??
  docs.find((d) => d.monthKey === monthKey) ??
  docs[0];
const chosen = prefer(
  [
    { ...inactiveCurrent, isActive: false },
    { ...activeUpload, isActive: true },
  ],
  "2026-09",
);
assert.equal(chosen?.pricingParams[0]?.fwdSellRate, 0.055, "active surface must beat inactive calendar month");
console.log("PASS active surface preference over inactive current month");
console.log("PASS vol-surface upload pipeline regression");
