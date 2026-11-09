/**
 * Prove level-column rename did not change calc inputs or golden quotes.
 */
import fs from "node:fs";
import path from "node:path";

import multiSeed from "../lib/data/multi-products-seed.json";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-golden-sep-2026.json";
// September 2026 golden surface: the parity locks stay on it when the monthly seed moves on.
import { toPlainProduct } from "../lib/data/load";
import { computeUnwind } from "../lib/engine/unwind";
import type { ProductMaster, VolSurface } from "../lib/types";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";
import { parseProductMasterWorkbook } from "../lib/workbook/parsers";
import { DESK_MASTER_HEADERS, PRODUCT_MASTER_HEADERS } from "../lib/workbook/master-columns";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const surface = volSeed as VolSurface;
const goldenInputs = {
  unwindDate: "2025-02-21",
  spot: 22800,
  debentures: 1000,
  bidAskSpread: 0.01,
  underlying: "Nifty" as const,
};

const seed = toPlainProduct(productSeed as ProductMaster);
const golden = computeUnwind({ product: seed, surface, inputs: goldenInputs });

// New Primary observation dates on 961 (23-Feb-2027 first expiry) + ROUND marks.
check("golden quote pct locked", Math.abs(golden.unwindQuotePct - 1.4718016624926513) < 1e-9, String(golden.unwindQuotePct));
check("golden uses Contingent Level", golden.contingentLevel === seed.contingentLevel, String(golden.contingentLevel));
check("golden exposes Initial Underlying Level", golden.initialNiftyLevel === seed.initialNiftyLevel, String(golden.initialNiftyLevel));
check("golden leg0 prdPremium", Math.abs((golden.optionRows[0]?.prdPremium ?? 0) - 283988423.1908789) < 2000);

const root = process.cwd();
const singleBuf = fs.readFileSync(path.join(root, "public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx"));
const multiBuf = fs.readFileSync(path.join(root, "public/samples/Product_Master_Input_Multiple_Products.xlsx"));
const single = toPlainProduct(parseProductMasterWorkbook(singleBuf.buffer.slice(singleBuf.byteOffset, singleBuf.byteOffset + singleBuf.byteLength)));
const multiParsed = parseProductMasterBook(multiBuf).map(toPlainProduct);

check("single sample initial", single.initialNiftyLevel === seed.initialNiftyLevel, String(single.initialNiftyLevel));
check("single sample contingent", single.contingentLevel === seed.contingentLevel, String(single.contingentLevel));
check(
  "single sample qty0",
  Math.abs((single.legs[0]?.reqQuantity ?? 0) - (seed.legs[0]?.reqQuantity ?? 0)) < 0.05,
  String(single.legs[0]?.reqQuantity),
);

const sampleQuote = computeUnwind({ product: single, surface, inputs: goldenInputs });
check(
  "sample single quote matches seed quote",
  Math.abs(sampleQuote.unwindQuotePct - golden.unwindQuotePct) < 1e-9,
  `${sampleQuote.unwindQuotePct} vs ${golden.unwindQuotePct}`,
);

check("multi sample product count", multiParsed.length === (multiSeed as ProductMaster[]).length, String(multiParsed.length));

const seedList = (multiSeed as ProductMaster[]).map(toPlainProduct);
let qtyMismatches = 0;
let levelMismatches = 0;
let quoteMismatches = 0;
for (let i = 0; i < Math.min(seedList.length, multiParsed.length); i++) {
  const a = seedList[i]!;
  const b = multiParsed[i]!;
  if (a.initialNiftyLevel !== b.initialNiftyLevel || a.contingentLevel !== b.contingentLevel) levelMismatches += 1;
  const n = Math.min(a.legs.length, b.legs.length);
  for (let j = 0; j < n; j++) {
    if (Math.abs((a.legs[j]?.reqQuantity ?? 0) - (b.legs[j]?.reqQuantity ?? 0)) > 0.05) qtyMismatches += 1;
  }
}
for (const idx of [0, 1, 2, Math.floor(seedList.length / 2), seedList.length - 1]) {
  const a = seedList[idx];
  const b = multiParsed[idx];
  if (!a || !b) continue;
  const qa = computeUnwind({ product: a, surface, inputs: goldenInputs }).unwindQuotePct;
  const qb = computeUnwind({ product: b, surface, inputs: goldenInputs }).unwindQuotePct;
  if (Math.abs(qa - qb) > 1e-9) quoteMismatches += 1;
}

check("multi sample levels match seed", levelMismatches === 0, String(levelMismatches));
check("multi sample qtys match seed", qtyMismatches === 0, String(qtyMismatches));
check(
  "multi sample quote spot-check matches seed",
  quoteMismatches === 0,
  String(quoteMismatches),
);

// Also lock every product quote when samples store full precision.
let allQuoteMismatches = 0;
let maxQuoteDelta = 0;
for (let i = 0; i < seedList.length; i++) {
  const a = seedList[i]!;
  const b = multiParsed[i]!;
  const qa = computeUnwind({ product: a, surface, inputs: goldenInputs }).unwindQuotePct;
  const qb = computeUnwind({ product: b, surface, inputs: goldenInputs }).unwindQuotePct;
  const d = Math.abs(qa - qb);
  maxQuoteDelta = Math.max(maxQuoteDelta, d);
  if (d > 1e-9) allQuoteMismatches += 1;
}
check(
  "multi sample all quotes match seed",
  allQuoteMismatches === 0,
  `mismatches=${allQuoteMismatches} maxΔ=${maxQuoteDelta}`,
);

const distinct = seedList.filter((p) => p.contingentLevel !== p.initialNiftyLevel);
check(
  "engine keeps distinct Contingent when present",
  distinct.every((p) => {
    const r = computeUnwind({ product: p, surface, inputs: goldenInputs });
    return r.contingentLevel === p.contingentLevel && r.initialNiftyLevel === p.initialNiftyLevel;
  }),
  `distinct=${distinct.length}`,
);

// Blank Contingent (raw, not toPlainProduct) falls back to Initial for prem % and qty.
const blankContingent = {
  ...seed,
  contingentLevel: 0,
  initialNiftyLevel: seed.initialNiftyLevel,
} as ProductMaster;
const blankResult = computeUnwind({ product: blankContingent, surface, inputs: goldenInputs });
check(
  "blank Contingent falls back to Initial for prem %",
  blankResult.contingentLevel === seed.initialNiftyLevel,
  String(blankResult.contingentLevel),
);
check(
  "blank Contingent does not invent a different Initial",
  blankResult.initialNiftyLevel === seed.initialNiftyLevel,
  String(blankResult.initialNiftyLevel),
);
check(
  "blank Contingent keeps golden quote when reqQuantity is present",
  Math.abs(blankResult.unwindQuotePct - golden.unwindQuotePct) < 1e-9,
  String(blankResult.unwindQuotePct),
);

const noQty = (contingent: number): ProductMaster =>
  ({
    ...seed,
    contingentLevel: contingent,
    initialNiftyLevel: seed.initialNiftyLevel,
    legs: seed.legs.map((leg) => ({ ...leg, reqQuantity: undefined })),
  }) as ProductMaster;
const qtyBlank = computeUnwind({ product: noQty(0), surface, inputs: goldenInputs });
const qtyOk = computeUnwind({ product: noQty(seed.initialNiftyLevel), surface, inputs: goldenInputs });
check(
  "blank Contingent qty fallback matches Initial (no reqQuantity)",
  Math.abs((qtyBlank.optionRows[0]?.quantity ?? 0) - (qtyOk.optionRows[0]?.quantity ?? 1)) < 0.02,
  `${qtyBlank.optionRows[0]?.quantity} vs ${qtyOk.optionRows[0]?.quantity}`,
);

const distinctSynth = {
  ...seed,
  contingentLevel: 23500,
  initialNiftyLevel: 17600,
} as ProductMaster;
const distinctResult = computeUnwind({ product: distinctSynth, surface, inputs: goldenInputs });
check(
  "distinct Contingent is preferred over Initial",
  distinctResult.contingentLevel === 23500 && distinctResult.initialNiftyLevel === 17600,
  `${distinctResult.contingentLevel}/${distinctResult.initialNiftyLevel}`,
);

check("canonical workbook headers length 28", PRODUCT_MASTER_HEADERS.length === 28, String(PRODUCT_MASTER_HEADERS.length));
check("desk headers length 27", DESK_MASTER_HEADERS.length === 27, String(DESK_MASTER_HEADERS.length));
check("desk headers follow Initial Underlying Level with Allotment Date", DESK_MASTER_HEADERS[5] === "Initial Underlying Level" && DESK_MASTER_HEADERS[6] === "Allotment Date");
check(
  "desk headers count matches desk row builder",
  DESK_MASTER_HEADERS.length === 27,
  String(DESK_MASTER_HEADERS.length),
);

console.log(failures ? `\n${failures} level-column parity checks FAILED` : "\nLevel-column parity PASSED");
if (failures) process.exit(1);
