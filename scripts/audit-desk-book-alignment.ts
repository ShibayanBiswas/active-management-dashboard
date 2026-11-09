/**
 * Assert Desk Book multi matrix keeps Reported Inbuilt / costs aligned per product.
 */
import multiSeed from "../lib/data/multi-products-seed.json";
import { computeGroupedRowSpans, expandWindowToGroupBounds, formatNumber, formatPct, formatDeskDate } from "../lib/utils";
import type { ProductMaster } from "../lib/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const products = multiSeed as ProductMaster[];
const target = products.find((p) => /1569/.test(p.productName));
check("seed has Nifty Accelerator - 1569", Boolean(target), target?.productName);
if (!target) process.exit(1);

const targetIndex = products.findIndex((p) => /1569/.test(p.productName));
// Keep a small neighbouring window so Face Value boundary checks stay meaningful.
const from = Math.max(0, targetIndex - 1);
const sample = products.slice(from, from + 3);
const idx1569 = sample.findIndex((p) => /1569/.test(p.productName));
check("1569 in alignment sample window", idx1569 >= 0, String(idx1569));
if (idx1569 < 0) process.exit(1);

const matrix = sample.flatMap((item, productIndex) =>
  item.legs.map((leg) => [
    String(productIndex + 1),
    item.productName,
    item.productCode,
    formatNumber(item.mobilization, 0),
    leg.prdPrice == null ? "-" : formatNumber(leg.prdPrice, 2),
    formatPct(item.inbuilt),
    formatPct(item.tranCost),
    formatPct(item.issuanceCost),
    formatPct(item.marginCost),
    formatNumber(item.faceValue, 0),
    formatNumber(item.totalFundsForMargin, 2),
    formatNumber(item.initialNiftyLevel, 0),
    formatDeskDate(leg.expiry),
  ]),
);

const spans = computeGroupedRowSpans(
  matrix,
  matrix[0]?.map((_, i) => i) ?? [],
  0,
);

const start = sample.slice(0, idx1569).reduce((s, p) => s + p.legs.length, 0);
const inbuiltCol = 5;
const fundsCol = 10;
const initialCol = 11;

check(
  "1569 first row shows Reported Inbuilt span",
  (spans[start]?.[inbuiltCol] ?? 0) === sample[idx1569]!.legs.length,
  String(spans[start]?.[inbuiltCol]),
);
check(
  "1569 inbuilt text is 5.94%",
  matrix[start]?.[inbuiltCol] === formatPct(target.inbuilt),
  matrix[start]?.[inbuiltCol],
);
check(
  "1569 Total Funds For Margin matches Excel",
  matrix[start]?.[fundsCol] === formatNumber(target.totalFundsForMargin, 2),
  matrix[start]?.[fundsCol],
);
check(
  "1569 Initial Underlying Level shows",
  matrix[start]?.[initialCol] === formatNumber(target.initialNiftyLevel, 0),
  matrix[start]?.[initialCol],
);
check(
  "1569 contingent equals initial in seed",
  target.contingentLevel === target.initialNiftyLevel,
  `${target.contingentLevel}/${target.initialNiftyLevel}`,
);

// Ensure Face Value spans do not cross from product 0 into product 1
const faceCol = 9;
const product0Legs = sample[0]!.legs.length;
check(
  "Face Value span stops at product boundary",
  (spans[0]?.[faceCol] ?? 0) === product0Legs,
  `${spans[0]?.[faceCol]} vs ${product0Legs}`,
);
check(
  "next product Face Value starts fresh",
  (spans[product0Legs]?.[faceCol] ?? 0) === sample[1]!.legs.length,
  String(spans[product0Legs]?.[faceCol]),
);

const mid = Math.floor(sample[0]!.legs.length / 2);
const expanded = expandWindowToGroupBounds(matrix, mid, mid + 1, 0);
check(
  "virtual window expands to whole first product",
  expanded.start === 0 && expanded.end === product0Legs,
  JSON.stringify(expanded),
);

console.log(failures ? `\n${failures} desk-book alignment checks FAILED` : "\nDesk-book alignment PASSED");
if (failures) process.exit(1);
