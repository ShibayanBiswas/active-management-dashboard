/**
 * Thorough parse audit: collated FY21–FY27 multi book vs seed vs sample workbook.
 * Also confirms the legacy For Update book is a subset (no double-count regressions).
 */
import fs from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";

import { computeUnwind } from "../lib/engine/unwind";
import { dedupeOptionLegs, optionLegCloneKey } from "../lib/multi/leg-position";
import { MULTI_BOOK_LEG_COUNT, MULTI_BOOK_PRODUCT_COUNT } from "../lib/multi/book-stats";
import { productKey } from "../lib/multi/product-key";
import type { ProductMaster, VolSurface } from "../lib/types";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";
import { validateProductMasterWorkbook } from "../lib/workbook/upload-schema";
import multiSeed from "../lib/data/multi-products-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";

const FOR_UPDATE =
  "C:\\Users\\shiba\\OneDrive\\Desktop\\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26) For Update.xlsm";
const SAMPLE = path.join(process.cwd(), "public/samples/Product_Master_Input_Multiple_Products.xlsx");
const DIFF_PATH = "C:\\Users\\shiba\\OneDrive\\Desktop\\Unwind Diff.xlsx";

const surface = volSeed as VolSurface;
const seed = multiSeed as ProductMaster[];
const inputs = { debentures: 1, unwindDate: "2026-08-17", spot: 24366 };

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function codeKey(p: ProductMaster): string {
  return (p.productCode || productKey(p)).trim().toUpperCase();
}

function tradeTime(p: ProductMaster): number {
  const t = Date.parse(p.tradeDate);
  return Number.isFinite(t) ? t : 0;
}

console.log("=== Collated book shape ===");
const sampleBuf = fs.readFileSync(SAMPLE);
const sample = parseProductMasterBook(sampleBuf);
const sampleLegs = sample.reduce((s, p) => s + p.legs.length, 0);
const seedLegs = seed.reduce((s, p) => s + p.legs.length, 0);

check("sample product count", sample.length === MULTI_BOOK_PRODUCT_COUNT, `${sample.length}`);
check("seed product count", seed.length === MULTI_BOOK_PRODUCT_COUNT, `${seed.length}`);
check("sample leg count", sampleLegs === MULTI_BOOK_LEG_COUNT, `${sampleLegs}`);
check("seed leg count", seedLegs === MULTI_BOOK_LEG_COUNT, `${seedLegs}`);
check(
  "unique product codes",
  new Set(seed.map(codeKey)).size === seed.length,
  String(new Set(seed.map(codeKey)).size),
);
const negativePremium = seed.filter(
  (p) => p.premiumFraction == null || !Number.isFinite(p.premiumFraction) || p.premiumFraction < 0,
);
check(
  "every seed Premium Credited fraction is positive",
  negativePremium.length === 0,
  negativePremium
    .slice(0, 5)
    .map((p) => `${p.productCode}=${p.premiumFraction}`)
    .join(", "),
);
check("seed sorted by trade date ascending", seed.every((p, i) => i === 0 || tradeTime(p) >= tradeTime(seed[i - 1])));
check(
  "first product is earliest FY21 Magnifier",
  seed[0]?.productName.includes("Magnifier") === true && seed[0]?.productCode.includes("ARG22SP01"),
  `${seed[0]?.productName} / ${seed[0]?.productCode}`,
);

console.log("\n=== For Update subset (legacy lock) ===");
if (!fs.existsSync(FOR_UPDATE)) {
  console.log("SKIP For Update XLSM not on disk —", FOR_UPDATE);
} else {
  const xlsm = parseProductMasterBook(fs.readFileSync(FOR_UPDATE));
  const xlsmLegs = xlsm.reduce((s, p) => s + p.legs.length, 0);
  const seedCodes = new Set(seed.map(codeKey));
  const missing = xlsm.filter((p) => !seedCodes.has(codeKey(p)));
  check("For Update product count still parses", xlsm.length >= 130, String(xlsm.length));
  check("For Update legs still parse", xlsmLegs >= 6000, String(xlsmLegs));
  check(
    "every For Update ISIN is in collated book",
    missing.length === 0,
    missing
      .slice(0, 5)
      .map((p) => p.productCode)
      .join(", "),
  );
}

console.log("\n=== Duplicate position filter ===");
let dupProducts = 0;
for (const p of seed) {
  const keys = p.legs.map(optionLegCloneKey);
  if (new Set(keys).size !== keys.length) dupProducts += 1;
}
check("no seed product has an exact cloned option row", dupProducts === 0, String(dupProducts));

const p1684 = seed.find((p) => p.productName.includes("1684"));
check("1684 has 42 legs after dedupe", (p1684?.legs.length ?? 0) === 42, String(p1684?.legs.length));
if (p1684) {
  const doubled = dedupeOptionLegs([...p1684.legs, ...p1684.legs]);
  check("dedupe halves synthetic double paste", doubled.length === p1684.legs.length, `${doubled.length}`);
}

console.log("\n=== Zero-qty / blank-qty hygiene ===");
check(
  "no zero-qty legs in book",
  seed.every((p) => p.legs.every((l) => (l.reqQuantity ?? 0) !== 0)),
);
check(
  "every leg has strike expiry side type",
  seed.every((p) =>
    p.legs.every(
      (l) =>
        l.strike > 0 &&
        Boolean(l.expiry) &&
        Boolean(l.optionType) &&
        (l.originalSide === "Buy" || l.originalSide === "Sell"),
    ),
  ),
);
const sellQtyMismatch = seed.flatMap((p) =>
  p.legs
    .filter((l) => l.originalSide === "Sell" && (l.reqQuantity ?? 0) > 0)
    .map((l) => `${p.productCode}:${l.strike}`),
);
check(
  "Sell legs keep non-positive Required Quantity",
  sellQtyMismatch.length === 0,
  sellQtyMismatch.slice(0, 5).join(", "),
);
const buyQtyMismatch = seed.flatMap((p) =>
  p.legs
    .filter((l) => l.originalSide === "Buy" && (l.reqQuantity ?? 0) < 0)
    .map((l) => `${p.productCode}:${l.strike}`),
);
check(
  "Buy legs keep non-negative Required Quantity",
  buyQtyMismatch.length === 0,
  buyQtyMismatch.slice(0, 5).join(", "),
);

console.log("\n=== Seed ↔ sample field parity (spot checks) ===");
const bySample = new Map(sample.map((p) => [codeKey(p), p]));
let mismatches = 0;
for (const p of seed.slice(0, 40)) {
  const s = bySample.get(codeKey(p));
  if (!s) {
    mismatches += 1;
    continue;
  }
  if (s.legs.length !== p.legs.length) mismatches += 1;
  if (Math.abs(s.mobilization - p.mobilization) > 1) mismatches += 1;
}
check("first 40 seed products match sample shape", mismatches === 0, String(mismatches));

const schema = validateProductMasterWorkbook(
  sampleBuf.buffer.slice(sampleBuf.byteOffset, sampleBuf.byteOffset + sampleBuf.byteLength) as ArrayBuffer,
);
if (schema.ok && schema.kind === "product-master") {
  check("schema product count", schema.summary.productCount === MULTI_BOOK_PRODUCT_COUNT, String(schema.summary.productCount));
  check("schema leg count", schema.summary.legs === MULTI_BOOK_LEG_COUNT, String(schema.summary.legs));
} else {
  check("schema validates multi sample", false, !schema.ok ? schema.issues.join(" | ") : "wrong kind");
}

console.log("\n=== Spot unwind sanity (named products) ===");
const spotChecks = ["1567", "1684", "359", "1619", "1664", "1605"];
for (const needle of spotChecks) {
  const p = seed.find((x) => x.productName.includes(needle));
  if (!p) {
    check(`spot ${needle} present`, false);
    continue;
  }
  const r = computeUnwind({ product: p, surface, inputs });
  check(
    `spot ${needle} quote finite`,
    Number.isFinite(r.unwindQuoteRs) && r.optionRows.length === p.legs.length,
    String(r.unwindQuoteRs),
  );
}

if (fs.existsSync(DIFF_PATH)) {
  console.log("\n=== Unwind Diff.xlsx (seed subset) ===");
  const wb = XLSX.read(fs.readFileSync(DIFF_PATH), { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const seedByKey = new Map(seed.map((p) => [productKey(p), p]));
  let within2k = 0;
  let compared = 0;
  for (const row of rows) {
    const name = String(row["Product Name"] ?? row["Product"] ?? "").trim();
    if (!name) continue;
    const excelB = Number(row["Unwind Quote Amount"] ?? row["B"] ?? row["App"] ?? NaN);
    if (!Number.isFinite(excelB)) continue;
    const product =
      seed.find((p) => p.productName === name) ??
      [...seedByKey.values()].find((p) => p.productName.includes(name.slice(0, 20)));
    if (!product) continue;
    const app = computeUnwind({ product, surface, inputs }).unwindQuoteRs;
    compared += 1;
    if (Math.abs(app - excelB) < 2000) within2k += 1;
  }
  check("Unwind Diff rows compared", compared >= 100, String(compared));
  check(
    "most compared products within ₹2000 of Excel B",
    within2k >= Math.floor(compared * 0.9),
    `${within2k}/${compared}`,
  );
}

console.log(failures ? `\n${failures} multi-parse checks FAILED` : "\nMulti-parse checks PASSED");
if (failures) process.exit(1);
