/**
 * Tally the eight FY Excel masters, the New Primary sheet, and the unwinding master.
 * Writes docs/10-master-tally.md. Does not change the seed.
 */
import fs from "node:fs";
import path from "node:path";

import type { ProductMaster } from "../lib/types";
import { isinKey } from "../lib/multi/product-key";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";
import multiSeed from "../lib/data/multi-products-seed.json";
import {
  indexNewPrimaryProducts,
  listedNewPrimaryName,
  matchNewPrimaryProduct,
} from "./sync-observation-expiries";

const FILES: Array<{ label: string; path: string }> = [
  {
    label: "Apr'21–Mar'22",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'21-Mar'22) 4.5 Fwd.xlsm`,
  },
  {
    label: "Apr'22–Mar'23",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'22-Mar'23)_1_updated_4.5fwd.xlsm`,
  },
  {
    label: "Apr'23–Mar'24",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'23-Mar'24) 4.5 Fwd.xlsm`,
  },
  {
    label: "Apr'24–Mar'25",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) 4.5Fwd.xlsm`,
  },
  {
    label: "Apr'25–Mar'26",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26) 6.xlsm`,
  },
  {
    label: "Apr'25–Mar'26 Sensex",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26)_Sensex Products 4.xlsm`,
  },
  {
    label: "Apr'26–Mar'27",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27).xlsm`,
  },
  {
    label: "Apr'26–Mar'27 Sensex",
    path: String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27)_Sensex Products.xlsm`,
  },
];

const SECONDARY = path.resolve(process.cwd(), "../Secondary SP Dashboard/lib/data/master-seed.json");
const OUT = path.join(process.cwd(), "docs/10-master-tally.md");

type SecondaryProduct = {
  name?: string;
  series?: string;
  raw?: Record<string, unknown>;
};

const RATE_FIELDS = [
  "coupon",
  "inbuilt",
  "tranCost",
  "issuanceCost",
  "marginCost",
  "marginFundingRate",
  "prdDiscRate",
  "premDiscRate",
] as const;

function close(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function ymd(value: string): string {
  return String(value ?? "").slice(0, 10);
}

function uniqueExpiries(product: ProductMaster): string[] {
  return [...new Set(product.legs.map((leg) => ymd(leg.expiry)))].filter(Boolean).sort();
}

function observationYmds(product: SecondaryProduct): string[] {
  const raw = product.raw ?? {};
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dates: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const text = String(raw[`Avg. ${i}`] ?? "").trim();
    const match = text.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
    if (!match) continue;
    const month = months[match[2]!.toLowerCase()];
    if (!month) continue;
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    dates.push(`${year}-${month}-${match[1]!.padStart(2, "0")}`);
  }
  return dates;
}

function money(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

async function main() {
  const seed = multiSeed as ProductMaster[];
  const seedBy = new Map(seed.map((product) => [isinKey(product), product]));
  const lines: string[] = [];
  const fileRows: string[] = [];
  const missing: string[] = [];
  const faceBreaks: string[] = [];
  const rateBreaks: string[] = [];
  const mobilisationBreaks: string[] = [];
  const excelNames = new Map<string, string>();
  let excelCodes = 0;

  for (const file of FILES) {
    if (!fs.existsSync(file.path)) {
      fileRows.push(`| ${file.label} | missing | | | | |`);
      continue;
    }
    const products = parseProductMasterBook(fs.readFileSync(file.path));
    let inSeed = 0;
    let faceOk = 0;
    let rateOk = 0;
    let mobOk = 0;
    for (const product of products) {
      const key = isinKey(product);
      excelCodes += 1;
      if (!excelNames.has(key)) excelNames.set(key, product.productName.trim());
      const hit = seedBy.get(key);
      if (!hit) {
        missing.push(`${file.label}: ${product.productCode} ${product.productName}`);
        continue;
      }
      inSeed += 1;
      if (close(product.faceValue, hit.faceValue, 0.01)) faceOk += 1;
      else if (faceBreaks.length < 20) {
        faceBreaks.push(`${product.productCode}: Excel ${product.faceValue} / master ${hit.faceValue}`);
      }
      if (close(product.mobilization, hit.mobilization, 1)) mobOk += 1;
      else if (mobilisationBreaks.length < 20) {
        mobilisationBreaks.push(`${product.productCode}: Excel ${product.mobilization} / master ${hit.mobilization}`);
      }
      const ratesMatch = RATE_FIELDS.every((field) => close(product[field], hit[field], 1e-6));
      if (ratesMatch) rateOk += 1;
      else if (rateBreaks.length < 20) {
        const field = RATE_FIELDS.find((name) => !close(product[name], hit[name], 1e-6));
        rateBreaks.push(
          `${product.productCode} ${field}: Excel ${field ? product[field] : ""} / master ${field ? hit[field] : ""}`,
        );
      }
    }
    const legs = products.reduce((sum, product) => sum + product.legs.length, 0);
    fileRows.push(
      `| ${file.label} | ${products.length} | ${legs} | ${inSeed} | ${faceOk} | ${mobOk} | ${rateOk} |`,
    );
    console.log(file.label, products.length, "in seed", inSeed);
  }

  const secondary = JSON.parse(fs.readFileSync(SECONDARY, "utf8")) as { products?: SecondaryProduct[] };
  const bySeries = indexNewPrimaryProducts(secondary.products ?? []);
  let matched = 0;
  let nameSame = 0;
  let nameFromPrimary = 0;
  let unmatched = 0;
  let expiryInside = 0;
  let expiryOutside = 0;
  let blankFormula = 0;
  const renamed: string[] = [];
  const outsideExamples: string[] = [];

  for (const product of seed) {
    if (!String(product.formulae ?? "").trim()) blankFormula += 1;
    const hit = matchNewPrimaryProduct(product, bySeries);
    if (!hit) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const listed = listedNewPrimaryName(hit);
    const excelName = excelNames.get(isinKey(product));
    if (listed === product.productName.trim()) nameSame += 1;
    if (excelName && excelName !== product.productName.trim()) {
      nameFromPrimary += 1;
      if (renamed.length < 30) {
        renamed.push(`| ${product.productCode} | ${excelName} | ${product.productName.trim()} |`);
      }
    }
    const obs = new Set(observationYmds(hit));
    for (const day of uniqueExpiries(product)) {
      if (obs.has(day)) expiryInside += 1;
      else {
        expiryOutside += 1;
        if (outsideExamples.length < 12) outsideExamples.push(`${product.productCode} ${day}`);
      }
    }
  }

  const accel = seed.find((product) => product.productName.trim() === "Nifty Accelerator - 706");
  const eight = [
    "ARG23SP21 - SERIES IV",
    "ARG23SP42 SERIES III",
    "ARG20SP16 - SERIES III",
    "ARG23SP123 SERIES I",
    "ARG24SP03 SERIES I",
    "ARG23SP166 SERIES II",
    "ARG25SP13 SERIES IV",
    "ARFS25SP16 SERIES III",
  ];
  const eightRows = eight.map((code) => {
    const product = seed.find((item) => isinKey(item) === code);
    return `| ${code} | ${product?.productName ?? "missing"} | ${product ? uniqueExpiries(product).slice(0, 3).join(", ") : ""} |`;
  });

  lines.push("# 10 — Master tally");
  lines.push("");
  lines.push("This is the tally of the eight FY Excel masters, the New Primary sheet, and the unwinding master in `lib/data/multi-products-seed.json`. The master is what the desk, MongoDB, and the sample workbooks use.");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)}. Master size: **${seed.length} products**, **${seed.reduce((n, p) => n + p.legs.length, 0)} legs**. Blank payoff formulas: **${blankFormula}**.`);
  lines.push("");
  lines.push("## What each source owns");
  lines.push("");
  lines.push("| Source | What it supplies |");
  lines.push("| --- | --- |");
  lines.push("| Eight FY Excel files | Product code, face value, mobilisation, coupon, cost rates, margin funding rate, margin funds, discount rates, option strikes and sides |");
  lines.push("| New Primary sheet | Listed product name for a matched series and phase. Observation Average 1–7 replaced option expiries when the schedule lined up |");
  lines.push("| Swap Product master | Payoff formula text |");
  lines.push("| Unwinding master | The book the calculator prices |");
  lines.push("");
  lines.push("## Eight Excel files against the master");
  lines.push("");
  lines.push("A row counts as mapped when its product code is on the master. Face, mobilisation, and the rate block (coupon, inbuilt, transaction cost, issuance cost, margin cost, margin funding rate, product discount rate, premium discount rate) are compared on that code.");
  lines.push("");
  lines.push("| File | Products | Legs | Codes on master | Face matches | Mobilisation matches | Rate block matches |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  lines.push(...fileRows);
  lines.push("");
  lines.push(`Excel rows read: ${excelCodes}. Codes missing from the master: **${missing.length}**.`);
  lines.push("");
  lines.push(missing.length ? missing.map((row) => `- ${row}`).join("\n") : "Every product code in the eight files is on the master.");
  lines.push("");
  lines.push("### Face, mobilisation, and rates");
  lines.push("");
  lines.push(faceBreaks.length ? `Face mismatches (first ${faceBreaks.length}):\n\n${faceBreaks.map((row) => `- ${row}`).join("\n")}` : "Face value matches on every mapped code.");
  lines.push("");
  lines.push(mobilisationBreaks.length ? `Mobilisation mismatches (first ${mobilisationBreaks.length}):\n\n${mobilisationBreaks.map((row) => `- ${row}`).join("\n")}` : "Mobilisation matches on every mapped code.");
  lines.push("");
  lines.push(rateBreaks.length ? `Rate mismatches (first ${rateBreaks.length}):\n\n${rateBreaks.map((row) => `- ${row}`).join("\n")}` : "Coupon, costs, margin cost, margin funding rate, and both discount rates match on every mapped code.");
  lines.push("");
  lines.push("Margin funding rate is a master field. The quote uses it. NBFC Grown Value Rupees is the amount with the NBFC compounded at the product discount rate, plus the margin funds compounded at the margin funding rate, for invested days divided by 365. It does not appear as its own Post Observation column.");
  lines.push("");
  lines.push("## New Primary names and observation dates");
  lines.push("");
  lines.push(`Series matched on the New Primary sheet: **${matched}**. Unmatched: **${unmatched}**. Master name equals the New Primary listed name: **${nameSame}**. Master name differs from the Excel name: **${nameFromPrimary}**.`);
  lines.push("");
  lines.push(`Unique option expiries that sit on that product's Observation Average dates: **${expiryInside}**. Unique expiries that do not: **${expiryOutside}**.`);
  lines.push("");
  lines.push("When the Excel schedule and Observation Average 1–7 have the same number of dates, those averages replace the Excel dates in date order. A shorter or longer list moves a date only when an unused observation sits within 10 days. Nifty Accelerator 706 is the reference and stays on 2026-03-30, 2026-06-30, 2026-09-29.");
  lines.push("");
  lines.push(accel ? `706 expiries on the master: ${uniqueExpiries(accel).join(", ")}.` : "706 was not found by that exact name.");
  lines.push("");
  if (outsideExamples.length) {
    lines.push("Expiries outside the matched observation list (first examples):");
    lines.push("");
    lines.push(outsideExamples.map((row) => `- ${row}`).join("\n"));
    lines.push("");
  }
  lines.push("### Names taken from New Primary where the Excel name differed");
  lines.push("");
  lines.push("| Product code | Excel name | Master name |");
  lines.push("| --- | --- | --- |");
  lines.push(...(renamed.length ? renamed : ["| — | — | — |"]));
  if (nameFromPrimary > renamed.length) {
    lines.push("");
    lines.push(`The table shows the first ${renamed.length} of ${nameFromPrimary} renamed products.`);
  }
  lines.push("");
  lines.push("### Eight series the Excel product number did not match");
  lines.push("");
  lines.push("These keep the Excel product code. The displayed name is the New Primary listed name for that series and phase.");
  lines.push("");
  lines.push("| Product code | Master name | First expiries |");
  lines.push("| --- | --- | --- |");
  lines.push(...eightRows);
  lines.push("");
  lines.push("## Net Premium Outflow");
  lines.push("");
  lines.push("On every product, Premium Outflow is the sum of Premium Outflow Amount on the Options Book. Each leg amount is the unwind mark times Unwind Quantity. An expired put or call uses the in-the-money price at the Yahoo close on or before that leg's expiry. Original Sell pays, so the amount is negative. Original Buy receives, so the amount is positive. Out of the money is zero. The same price is used for Unwind Buy and Unwind Sell.");
  lines.push("");
  lines.push("The Product Book Premium Outflow card adds those leg amounts for option expiries inside the start and end dates, for products on the current tab that match the observation mode. It updates when the dates, the mode, the tab, or the search change, and when the daily quotes reload.");
  lines.push("");
  fs.writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log("wrote", OUT);
  console.log({ missing: missing.length, faceBreaks: faceBreaks.length, mob: mobilisationBreaks.length, rates: rateBreaks.length, matched, unmatched, nameFromPrimary, expiryOutside, blankFormula });
}

void main();
