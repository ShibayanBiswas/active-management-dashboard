/**
 * Locks desk export layout: Options Book PDF clubs same-value cells inside each
 * strike group without opening a header-only blank page, and the Unwinding
 * Calculator's workbook and PDF contain only the sheets and sections we add.
 */
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { spannedPdfBody } from "../lib/workbook/pdf-table";
import { OPTION_BOOK_MERGE_COLS, PRICER_MERGE_COLS } from "../lib/workbook/table-merge";
import { computeGroupedRowSpans, formatDeskDate, formatNumber, formatPct } from "../lib/utils";
import { scenarioGrid } from "../lib/active-management/scenario";
import { collectExpiredLegExpiryDates } from "../lib/engine/expiry-spots";
import { priceProductBook } from "../lib/engine/pricer";
import { computeUnwind } from "../lib/engine/unwind";
import { normalizeVolSurface } from "../lib/engine/vol-surface";
import { activeManagementTab, productPricerTab, scenarioGridTab } from "../lib/workbook/am-export-columns";
import { buildUnwindPageWorkbook, buildUnwindScreenPdf } from "../lib/workbook/export-screen";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import type { ProductMaster, UnwindInputs, VolSurface } from "../lib/types";

let failures = 0;
function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const HEADERS = [
  "Option Type",
  "Strike Price",
  "Number of Spreads",
  "Original Buy or Sell",
  "Unwind Buy or Sell",
  "Unwind Quantity",
  "Option Expiry Date",
  "Product Premium Per Spread",
  "Product Premium Amount",
  "Unwind Option Price",
  "Premium Outflow Amount",
];

const STRIKES = ["23,408", "22,880", "19,008", "14,960", "14,608", "12,320"];
const EXPIRIES = ["25-Feb-27", "27-May-27", "26-Aug-27", "25-Nov-27"];

const rows = STRIKES.flatMap((strike) =>
  EXPIRIES.map((expiry) => [
    "Put",
    strike,
    "26.00",
    "Sell",
    "Buy",
    "-36,931.82",
    expiry,
    "3,215.70",
    "Rs. 28,39,88,789.40",
    "316.39",
    "Rs. -2,79,41,055.08",
  ]),
);

const body = spannedPdfBody(rows, 1, (v) => v, OPTION_BOOK_MERGE_COLS);
assert("options PDF body has 24 rows", body.length === 24, String(body.length));
const first = body[0] ?? [];
const second = body[1] ?? [];
assert("first strike clubs Option Type", typeof first[0] === "object" && first[0].rowSpan === 4);
assert("first strike clubs Strike Price", typeof first[1] === "object" && first[1].rowSpan === 4);
assert("continuation row omits clubbed cells", second.length < first.length, `${second.length} < ${first.length}`);
assert("expiry stays a per-leg cell", typeof first[6] === "string" || (typeof first[6] === "object" && first[6].rowSpan === 1));

// Near-identical rounded deltas must not merge (22880 Aug/Nov at spot 24435.95).
const priced = priceProductBook({
  product: productSeed as ProductMaster,
  surface: volSeed as VolSurface,
  valuationDate: "2026-08-13",
  spot: 24435.95,
  bidAskSpread: 0,
});
const pricerMatrix = priced.map((r) => [
  formatNumber(r.strike, 0),
  formatDeskDate(r.maturity),
  formatDeskDate(r.valuationDate),
  r.optionType,
  formatNumber(r.spot, 2),
  formatPct(r.forwardGrowth),
  formatPct(r.discountYield),
  formatPct(r.volatility),
  formatPct(r.volBump),
  formatPct(r.bidOffer),
  formatNumber(r.price, 2),
  formatNumber(r.sellPrice, 2),
  formatNumber(r.buyPrice, 2),
  formatNumber(r.delta, 6),
]);
const pricerSpans = computeGroupedRowSpans(pricerMatrix, [...PRICER_MERGE_COLS], 0);
const deltaCol = 13;
const midCol = 10;
let mergedPriced = 0;
for (let i = 0; i < pricerSpans.length; i++) {
  if ((pricerSpans[i]?.[deltaCol] ?? 1) > 1) mergedPriced += 1;
  if ((pricerSpans[i]?.[midCol] ?? 1) > 1) mergedPriced += 1;
  if ((pricerSpans[i]?.[1] ?? 1) > 1) mergedPriced += 1; // expiry
}
assert("pricer never merges delta/mid/expiry", mergedPriced === 0, String(mergedPriced));
const aug22880 = priced.findIndex((r) => r.strike === 22880 && r.maturity.startsWith("2027-08"));
const nov22880 = priced.findIndex((r) => r.strike === 22880 && r.maturity.startsWith("2027-11"));
assert("22880 Aug present", aug22880 >= 0);
assert("22880 Nov present", nov22880 >= 0);
assert(
  "22880 Aug and Nov each keep a delta cell",
  (pricerSpans[aug22880]?.[deltaCol] ?? 0) === 1 && (pricerSpans[nov22880]?.[deltaCol] ?? 0) === 1,
  `${pricerSpans[aug22880]?.[deltaCol]}/${pricerSpans[nov22880]?.[deltaCol]}`,
);
assert(
  "22880 Aug vs Nov delta strings both shown",
  pricerMatrix[aug22880]?.[deltaCol] != null && pricerMatrix[nov22880]?.[deltaCol] != null,
);
const pdfPricer = spannedPdfBody(pricerMatrix, 0, (v) => v, PRICER_MERGE_COLS);
const pdfAug = pdfPricer[aug22880] ?? [];
const pdfNov = pdfPricer[nov22880] ?? [];
const pdfAugDelta = pdfAug[pdfAug.length - 1];
const pdfNovDelta = pdfNov[pdfNov.length - 1];
assert(
  "pricer PDF keeps Aug 22880 delta cell",
  typeof pdfAugDelta === "string" || (typeof pdfAugDelta === "object" && pdfAugDelta.rowSpan === 1),
);
assert(
  "pricer PDF keeps Nov 22880 delta cell",
  typeof pdfNovDelta === "string" || (typeof pdfNovDelta === "object" && pdfNovDelta.rowSpan === 1),
);

const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
autoTable(doc, {
  startY: 52,
  margin: { left: 14, right: 14, top: 14, bottom: 16 },
  tableWidth: doc.internal.pageSize.getWidth() - 28,
  head: [HEADERS],
  body,
  theme: "grid",
  showHead: "everyPage",
  pageBreak: "auto",
  rowPageBreak: "avoid",
  horizontalPageBreak: false,
  headStyles: { fontSize: 5.8, cellPadding: 1.1, overflow: "linebreak" },
  styles: { fontSize: 6.2, cellPadding: 0.85, minCellHeight: 4.4, overflow: "linebreak", valign: "middle" },
});

const pages = doc.getNumberOfPages();
const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
assert(
  "options book PDF is not an orphan-header pair",
  pages === 1 || (pages === 2 && finalY > 40),
  `${pages} pages, finalY=${finalY}`,
);
assert("first PDF page carries table body", pages === 1 || finalY > 40, `pages=${pages}`);

/**
 * The Unwinding Calculator's own Download Excel and Download PDF, built by the real builders: the
 * five summary tabs as before, then Active Management, Pricer Table and Scenario Grid.
 */
async function pageDownloads() {
  const product = productSeed as ProductMaster;
  const surface = normalizeVolSurface(volSeed as VolSurface);
  const spot = 24435.95;
  const inputs: UnwindInputs = {
    debentures: Math.round(product.mobilization / product.faceValue),
    unwindDate: "2026-08-13",
    spot,
    underlying: "Nifty",
    nifty: spot,
    sensex: null,
    bidAskSpread: null,
    expirySpots: Object.fromEntries(collectExpiredLegExpiryDates(product, "2026-08-13").map((day) => [day, spot])),
  };
  const result = computeUnwind({ product, surface, inputs });
  const basis = { product, surface, inputs, result };
  const tabs = [
    activeManagementTab({ ...basis, actualTarget: null, actualTargetSource: null, deskLevels: { nifty: spot, sensex: null } }).doc,
    productPricerTab(basis).doc,
    scenarioGridTab(scenarioGrid({ product, surface, inputs, baseResult: result })).doc,
  ];
  const names = (wb: ExcelJS.Workbook) => wb.worksheets.map((ws) => ws.name).join(", ");

  const before = await buildUnwindPageWorkbook(result, []);
  assert("unwind workbook without tabs keeps exactly its two sheets", names(before) === "Unwinding Summary, Options Book", names(before));
  const page = await buildUnwindPageWorkbook(result, tabs);
  assert(
    "unwind workbook adds Active Management, Pricer Table and Scenario Grid after them",
    names(page) === "Unwinding Summary, Options Book, Active Management, Pricer Table, Scenario Grid",
    names(page),
  );
  assert("no default blank sheet", page.worksheets.every((ws) => ws.name !== "Sheet1"), names(page));
  const cellsOf = (name: string) => {
    const out: string[] = [];
    page.getWorksheet(name)?.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? ""))));
    return out;
  };
  assert("Active Management sheet has its rates", cellsOf("Active Management").includes("Expected Internal Rate of Return"));
  assert("Pricer Table sheet has its headers", cellsOf("Pricer Table").includes("Bid Offer Spread"));
  assert("Scenario Grid sheet has Expected Difference", cellsOf("Scenario Grid").includes("Change In Expected Difference"));

  const orientations = (doc: jsPDF) =>
    Array.from({ length: doc.getNumberOfPages() }, (_, i) => {
      doc.setPage(i + 1);
      return doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? "L" : "P";
    }).join("");
  const basePdf = (await buildUnwindScreenPdf(result, [])).finish();
  const pagePdf = (await buildUnwindScreenPdf(result, tabs)).finish();
  const baseShape = orientations(basePdf);
  const pageShape = orientations(pagePdf);
  assert("unwind PDF without tabs stays portrait", /^P+$/.test(baseShape), baseShape);
  assert(
    "unwind PDF keeps its portrait pages, then Active Management portrait, then the two tables landscape",
    pageShape.startsWith(baseShape) && /^P+L+$/.test(pageShape),
    pageShape,
  );
  const text = pagePdf.output();
  assert(
    "unwind PDF carries the three tab banners",
    ["(Active Management)", "(Pricer Table)", "(Scenario Grid)"].every((t) => text.includes(t)),
  );
}

void pageDownloads()
  .catch((e: unknown) => {
    assert("page downloads build", false, e instanceof Error ? e.message : String(e));
  })
  .finally(() => {
    if (failures > 0) {
      console.error(`\nExport checks FAILED (${failures})`);
      process.exit(1);
    }
    console.log("\nExport checks PASSED");
  });
