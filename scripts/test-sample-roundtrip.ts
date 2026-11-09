import fs from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  AUGUST_REFERENCE_SENSEX_PRICE,
  AUGUST_REFERENCE_UNDERLYING_PRICE,
  DEFAULT_SURFACE_MONTH_KEY,
} from "../lib/engine/vol-surface";
import { parseProductMasterWorkbook, parseVolSurfaceWorkbook } from "../lib/workbook/parsers";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";
import { MULTI_BOOK_LEG_COUNT, MULTI_BOOK_PRODUCT_COUNT } from "../lib/multi/book-stats";
import { validateProductMasterWorkbook, volSurfaceSampleFileName } from "../lib/workbook/upload-schema";
import volSeed from "../lib/data/vol-surface-seed.json";

const VOL_SAMPLE = `public/samples/${volSurfaceSampleFileName()}`;

import { countSheetImages, sampleHasMaroonMasthead } from "./sample-branding";

function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function cellHasColorFill(fill: ExcelJS.Fill | undefined): boolean {
  if (!fill || fill.type !== "pattern") return false;
  const pattern = fill as ExcelJS.FillPattern;
  if (pattern.pattern === "none") return false;
  const argb = String(pattern.fgColor?.argb ?? "").toUpperCase();
  return argb.length > 0;
}

async function assertDataCellsUncolored(path: string, sheetName: string, brandRows: number) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) {
    assert(`${path} sheet ${sheetName}`, false, "missing");
    return;
  }
  let colored = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= brandRows) return;
    row.eachCell((cell) => {
      if (cell.value == null || cell.value === "") return;
      if (cellHasColorFill(cell.fill)) colored += 1;
    });
  });
  assert(`${sheetName} table cells uncolored`, colored === 0, colored ? `${colored} filled` : undefined);
}

async function main() {
const vb = fs.readFileSync(VOL_SAMPLE);
// Seeded sample is the current monthly grid. Parse with that month key so the roundtrip
// checks the file itself; live upload still stamps the current desk month.
const vs = parseVolSurfaceWorkbook(
  vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.byteLength) as ArrayBuffer,
  DEFAULT_SURFACE_MONTH_KEY,
);
assert("surface deep strike", vs.deepStrike === 500);
assert("surface month", vs.monthKey === DEFAULT_SURFACE_MONTH_KEY || vs.label.toLowerCase().includes("september"));
assert("surface reference nifty", vs.referenceUnderlyingPrice === AUGUST_REFERENCE_UNDERLYING_PRICE, String(vs.referenceUnderlyingPrice));
assert("surface reference sensex", vs.referenceSensexPrice === AUGUST_REFERENCE_SENSEX_PRICE, String(vs.referenceSensexPrice));
assert("surface moneyness count", vs.moneyness.length === 20);
assert("surface has 135 percent", vs.moneyness.some((m) => Math.abs(m - 1.35) < 1e-9));
assert("surface expiries", vs.expiries.length === volSeed.expiries.length, String(vs.expiries.length));
assert("surface no bid-ask on sheet", vs.bidAskSpread == null);
assert("vol width", vs.volsPercent[0]?.length === 21);
assert("surface params count", vs.pricingParams.length === 1, String(vs.pricingParams.length));
assert(
  "surface fwd 6.6 percent",
  Math.abs((vs.pricingParams[0]?.fwdSellRate ?? 0) - 0.066) < 1e-9,
  String(vs.pricingParams[0]?.fwdSellRate),
);

const nativeWb = XLSX.read(vb, { type: "buffer", cellDates: true });
nativeWb.Sheets["Surface Parameters"] = XLSX.utils.aoa_to_sheet([
  [null, null, "BID", "Vol - Bid/Offer", null, null, null, "Fwd Sell rate"],
  [null, new Date(Date.UTC(2026, 3, 30)), 0, 0, null, null, null, 0.0385],
  [null, new Date(Date.UTC(2026, 11, 31)), 0, 0, null, null, null, 0.07],
]);
const nativeRaw = XLSX.write(nativeWb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const nativeSurface = parseVolSurfaceWorkbook(
  nativeRaw.buffer.slice(nativeRaw.byteOffset, nativeRaw.byteOffset + nativeRaw.byteLength) as ArrayBuffer,
  "2026-08",
);
assert("native xlsm params count", nativeSurface.pricingParams.length === 2, String(nativeSurface.pricingParams.length));
assert(
  "native short fwd 3.85 percent",
  Math.abs((nativeSurface.pricingParams[0]?.fwdSellRate ?? 0) - 0.0385) < 1e-9,
  String(nativeSurface.pricingParams[0]?.fwdSellRate),
);
assert(
  "native long fwd 7 percent",
  Math.abs((nativeSurface.pricingParams[1]?.fwdSellRate ?? 0) - 0.07) < 1e-9,
  String(nativeSurface.pricingParams[1]?.fwdSellRate),
);

const pb = fs.readFileSync("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx");
const pm = parseProductMasterWorkbook(pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.byteLength) as ArrayBuffer);
assert("product name", pm.productName === "Nifty Accelerator - 961");
assert("product legs", pm.legs.length === 24);
assert("leg0 strike", pm.legs[0]?.strike === 23408);
assert("leg0 req qty", Math.abs((pm.legs[0]?.reqQuantity ?? 0) - -88313.21) < 0.05);

console.log("surface strikes", vs.strikes.length, "expiries", vs.expiries.length);
console.log("params", JSON.stringify(vs.pricingParams), "bidAsk", vs.bidAskSpread);
console.log("first expiry", vs.expiries[0], "vol[0][0..3]", vs.volsPercent[0].slice(0, 4));
console.log("product", pm.productName, pm.productCode, "mob", pm.mobilization, "legs", pm.legs.length);
console.log("leg0", JSON.stringify(pm.legs[0]));
console.log("leg7", JSON.stringify(pm.legs[7]));
console.log("leg23", JSON.stringify(pm.legs[23]));
console.log(
  "rates",
  pm.prdDiscRate,
  pm.premDiscRate,
  pm.inbuilt,
  pm.tranCost,
  pm.issuanceCost,
  pm.marginFundingRate,
  pm.totalFundsForMargin,
);

await assertDataCellsUncolored(VOL_SAMPLE, "Vol Surface", 8);
await assertDataCellsUncolored(VOL_SAMPLE, "Surface Parameters", 8);
await assertDataCellsUncolored(
  "public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx",
  "Product Master",
  8,
);

const volBook = new ExcelJS.Workbook();
await volBook.xlsx.readFile(VOL_SAMPLE);
const volSheet = volBook.getWorksheet("Vol Surface");
const labels: string[] = [];
volSheet?.eachRow((row) => {
  const v = row.getCell(1).value;
  if (typeof v === "string") labels.push(v.toLowerCase());
});
assert("vol sheet has no strike price row", !labels.some((v) => v.includes("strike price")));
assert("vol sheet has nifty strikes row", labels.some((v) => v.includes("nifty strikes")));
assert("vol sheet has sensex strikes row", labels.some((v) => v.includes("sensex strikes")));
assert("vol sample has logo", (await countSheetImages(VOL_SAMPLE)) >= 1);
assert("vol sample has maroon masthead", await sampleHasMaroonMasthead(VOL_SAMPLE));
assert("961 sample has logo", (await countSheetImages("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx")) >= 1);
assert(
  "961 sample has maroon masthead",
  await sampleHasMaroonMasthead("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx"),
);
const paramsSheet = volBook.getWorksheet("Surface Parameters");
let paramsHasBid = false;
paramsSheet?.eachRow((row) => {
  const a = `${row.getCell(1).value ?? ""}`.toLowerCase();
  if (a.includes("bid")) paramsHasBid = true;
});
assert("vol params have no bid ask", !paramsHasBid);

const mb = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products.xlsx");
const multi = parseProductMasterBook(mb);
const multiLegCount = multi.reduce((sum, item) => sum + item.legs.length, 0);
assert("multi product count", multi.length === MULTI_BOOK_PRODUCT_COUNT, String(multi.length));
assert("multi legs exclude blank qty", multiLegCount === MULTI_BOOK_LEG_COUNT, String(multiLegCount));
assert(
  "multi no zero qty legs",
  multi.every((product) => product.legs.every((leg) => (leg.reqQuantity ?? 0) !== 0)),
);
assert("multi first name", multi[0]?.productName === "Nifty Magnifier - 495", multi[0]?.productName);
assert("multi first contingent", (multi[0]?.contingentLevel ?? 0) > 0, String(multi[0]?.contingentLevel));
assert("multi first qty signed", (multi[0]?.legs[0]?.reqQuantity ?? 0) !== 0, String(multi[0]?.legs[0]?.reqQuantity));
assert("multi first has live legs", (multi[0]?.legs.length ?? 0) > 0, String(multi[0]?.legs.length));
const firstExpiries = new Set((multi[0]?.legs ?? []).map((leg) => String(leg.expiry).slice(0, 10)));
assert("multi first has several option expiry dates", firstExpiries.size >= 1, String(firstExpiries.size));
const singleExpiries = new Set(pm.legs.map((leg) => String(leg.expiry).slice(0, 10)));
assert("961 sample has several option expiry dates", singleExpiries.size >= 4, String(singleExpiries.size));
const multiBuf = mb.buffer.slice(mb.byteOffset, mb.byteOffset + mb.byteLength) as ArrayBuffer;
const multiSchema = validateProductMasterWorkbook(multiBuf);
assert(
  "multi sample schema",
  multiSchema.ok && multiSchema.kind === "product-master" && multiSchema.summary.legs === MULTI_BOOK_LEG_COUNT,
  multiSchema.ok && multiSchema.kind === "product-master" ? String(multiSchema.summary.legs) : !multiSchema.ok ? multiSchema.issues.join(" | ") : "wrong kind",
);
// Branding occupies the top rows; find Product Name anywhere in the first 20.
const multiTitleWb = XLSX.read(mb, { type: "buffer", sheetRows: 20 });
const multiTitleSheet = multiTitleWb.Sheets[multiTitleWb.SheetNames[0]];
const multiTitleGrid = XLSX.utils.sheet_to_json<(string | number | null)[]>(multiTitleSheet, {
  header: 1,
  defval: null,
});
const multiTitleBlob = multiTitleGrid
  .slice(0, 12)
  .map((row) => (row ?? []).map((cell) => String(cell ?? "")).join(" "))
  .join(" | ");
assert(
  "multi sample branded title",
  multiTitleBlob.includes("Multiple Products") || multiTitleBlob.includes("Product Master"),
  multiTitleBlob.slice(0, 120),
);
assert(
  "multi sample has header row",
  multiTitleGrid.some((row) => String(row?.[0] ?? "").toLowerCase().includes("product name")),
);
assert(
  "multi sample product count in subtitle",
  multiTitleBlob.includes(String(MULTI_BOOK_PRODUCT_COUNT)),
  multiTitleBlob.slice(0, 160),
);
assert("multi sample has logo", (await countSheetImages("public/samples/Product_Master_Input_Multiple_Products.xlsx")) >= 1);
assert(
  "multi sample has maroon masthead",
  await sampleHasMaroonMasthead("public/samples/Product_Master_Input_Multiple_Products.xlsx"),
);

const mbRepeated = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx");
const multiRepeated = parseProductMasterBook(mbRepeated);
const multiRepeatedLegCount = multiRepeated.reduce((sum, item) => sum + item.legs.length, 0);
assert("multi repeated sample product count", multiRepeated.length === MULTI_BOOK_PRODUCT_COUNT, String(multiRepeated.length));
assert("multi repeated sample legs", multiRepeatedLegCount === MULTI_BOOK_LEG_COUNT, String(multiRepeatedLegCount));
assert(
  "multi repeated sample first product matches merged sample",
  multiRepeated[0]?.productName === multi[0]?.productName && multiRepeated[0]?.legs.length === multi[0]?.legs.length,
  `${multiRepeated[0]?.productName} / ${multiRepeated[0]?.legs.length}`,
);
const repeatedTitleWb = XLSX.read(mbRepeated, { type: "buffer", sheetRows: 20 });
const repeatedTitleSheet = repeatedTitleWb.Sheets[repeatedTitleWb.SheetNames[0]];
const repeatedTitleGrid = XLSX.utils.sheet_to_json<(string | number | null)[]>(repeatedTitleSheet, {
  header: 1,
  defval: null,
});
const repeatedTitleBlob = repeatedTitleGrid
  .slice(0, 12)
  .map((row) => (row ?? []).map((cell) => String(cell ?? "")).join(" "))
  .join(" | ");
assert(
  "repeated master title present",
  repeatedTitleBlob.includes("Multiple Products") || repeatedTitleBlob.includes("Product Master"),
);
assert(
  "repeated master has product name column",
  repeatedTitleGrid.some((row) => String(row?.[0] ?? "").toLowerCase().includes("product name")),
);
assert(
  "repeated sample has logo",
  (await countSheetImages("public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx")) >= 1,
);
assert(
  "repeated sample has maroon masthead",
  await sampleHasMaroonMasthead("public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"),
);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
