/**
 * Locks Product Book + Unwinding + Options Book + Pricer download pipelines.
 * Uses the real styled workbook builders (maroon/gold masthead) and checks
 * column contracts against the desk UI + Main Master mapping.
 */
import fs from "node:fs";
import path from "node:path";

import {
  buildMultiProductBookWorkbook,
  buildPricerScreenWorkbook,
  buildUnwindScreenWorkbook,
  optionBookRowsFlat,
} from "../lib/workbook/build-screen-excel";
import {
  ACTIVE_MANAGEMENT_BOOK_HEADERS,
  OPTION_BOOK_HEADERS,
  PRODUCT_BOOK_HEADERS,
  PRODUCT_BOOK_SOURCE_MAP,
  PRICER_TABLE_HEADERS,
} from "../lib/workbook/export-columns";
import { EXCEL_THEME } from "../lib/workbook/export-theme";
import { BOOK_SCENARIO_SHIFTS, type BookScenarioRow } from "../lib/active-management/book-scenario";
import {
  BOOK_SCENARIO_CENTRE_COL,
  BOOK_SCENARIO_HEADERS,
  BOOK_SCENARIO_METRICS,
  bookScenarioDisplayRow,
  buildBookScenarioWorkbook,
} from "../lib/workbook/book-scenario-export";
import { computeUnwind } from "../lib/engine/unwind";
import { priceProductBook } from "../lib/engine/pricer";
import { productsWithLiveMaturity } from "../lib/observation-tabs";
import { issuedCount, productKey } from "../lib/multi/product-key";
import { PRODUCT_MASTER_HEADERS } from "../lib/workbook/master-columns";
import { buildProductBookExcelMatrix, buildProductBookMatrix, quoteViewFromUnwind } from "../lib/workbook/product-book-rows";
import { parseProductMasterBook } from "../lib/workbook/parse-multi-master";
import multiSeed from "../lib/data/multi-products-seed.json";
import productSeed from "../lib/data/product-master-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import type { ProductMaster, UnwindResult, VolSurface } from "../lib/types";
import { deskTodayISO, formatDeskRupees, underlyingFromProductName } from "../lib/utils";

let failures = 0;
function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const AS_OF = "2026-08-17";
const NIFTY = 24366;
const SENSEX = 78009.25;

const XLSM_FILES = [
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'21-Mar'22) 4.5 Fwd.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'22-Mar'23)_1_updated_4.5fwd.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'23-Mar'24) 4.5 Fwd.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) 4.5Fwd.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26) 6.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'25-Mar'26)_Sensex Products 4.xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27).xlsm`,
  String.raw`C:\Users\shiba\Downloads\Unwinding Calculator (New) Mar 2022 (Apr'26-Mar'27)_Sensex Products.xlsm`,
];

function unwindProduct(product: ProductMaster, surface: VolSurface): UnwindResult {
  const underlying = underlyingFromProductName(product.productName, product.productCode);
  const spot = underlying === "Sensex" ? SENSEX : NIFTY;
  return computeUnwind({
    product,
    surface,
    inputs: {
      debentures: issuedCount(product),
      unwindDate: AS_OF,
      spot,
      underlying,
      nifty: NIFTY,
      sensex: SENSEX,
      bidAskSpread: 0,
    },
  });
}

function productBookRows(product: ProductMaster, result: UnwindResult, serial: number, asOf: string): string[][] {
  return buildProductBookMatrix({
    serial,
    product,
    asOf,
    quote: quoteViewFromUnwind(result, asOf),
  }).rows;
}

function argbOf(fill: unknown): string {
  if (!fill || typeof fill !== "object") return "";
  const fg = (fill as { fgColor?: { argb?: string } }).fgColor;
  return String(fg?.argb ?? "").toUpperCase();
}

async function main() {
  const surface = volSeed as VolSurface;
  const allProducts = multiSeed as ProductMaster[];
  const single = productSeed as ProductMaster;
  const asOf = deskTodayISO();
  const live = productsWithLiveMaturity(allProducts, asOf);

  console.log("\n=== Column contracts (desk ≡ download) ===");
  // 33 Unwinding columns, then the 15 Active Management columns.
  assert("Product Book header count 48", PRODUCT_BOOK_HEADERS.length === 48, String(PRODUCT_BOOK_HEADERS.length));
  assert(
    "Active Management columns in desk order",
    ACTIVE_MANAGEMENT_BOOK_HEADERS.join("|") ===
      [
        "Current Internal Rate of Return",
        "Expected Internal Rate of Return",
        "Expected Difference",
        "Exit Value",
        "Mobilization",
        "Actual Target",
        "Effective Target",
        "Observations Passed",
        "Observations Left",
        "Pending Observations",
        "Observation Start Date",
        "Observation End Date",
        "Next Observation Date",
        "Average So Far",
        "Observation Status",
      ].join("|"),
    ACTIVE_MANAGEMENT_BOOK_HEADERS.join("|"),
  );
  assert(
    "the first 33 Product Book columns are unchanged",
    PRODUCT_BOOK_HEADERS.slice(0, 33).join("|") ===
      [
        "Sr. No.", "Product Name", "Product Code", "Unwind Quote Amount", "Date As Of Today",
        "Product Internal Rate of Return", "Client Internal Rate of Return", "Premium Outflow",
        "Residual Internal Rate of Return", "Face Value", "Initial Underlying Level", "Contingent Coupon",
        "Inbuilt", "Transaction Cost", "Issuance Cost", "Margin Cost", "Delta Date", "Allotment Date",
        "Maturity Date", "Tenor", "Invested Tenor", "Residual Tenor", ...OPTION_BOOK_HEADERS,
      ].join("|"),
  );
  assert(
    "Product Book source map follows the header order",
    PRODUCT_BOOK_SOURCE_MAP.map((item) => item.header).join("|") === PRODUCT_BOOK_HEADERS.join("|"),
  );
  assert(
    "no Product Book column mentions an assumed level",
    PRODUCT_BOOK_HEADERS.every((header) => !/assumed/i.test(header)),
  );
  assert(
    "Premium Outflow sits after Client Internal Rate of Return",
    PRODUCT_BOOK_HEADERS[PRODUCT_BOOK_HEADERS.indexOf("Client Internal Rate of Return") + 1] === "Premium Outflow",
  );
  assert(
    "Option book columns close the Unwinding columns",
    PRODUCT_BOOK_HEADERS.slice(
      -(ACTIVE_MANAGEMENT_BOOK_HEADERS.length + OPTION_BOOK_HEADERS.length),
      -ACTIVE_MANAGEMENT_BOOK_HEADERS.length,
    ).join("|") === OPTION_BOOK_HEADERS.join("|"),
  );
  assert(
    "Active Management columns close the Product Book",
    PRODUCT_BOOK_HEADERS.slice(-ACTIVE_MANAGEMENT_BOOK_HEADERS.length).join("|") === ACTIVE_MANAGEMENT_BOOK_HEADERS.join("|"),
  );
  assert("Options Book header count 11", OPTION_BOOK_HEADERS.length === 11);
  assert("Options Book has no Quantity Rounded column", !OPTION_BOOK_HEADERS.includes("Quantity Rounded" as never));
  assert("Pricer header count 14", PRICER_TABLE_HEADERS.length === 14);
  assert("Product Book source map covers every header", PRODUCT_BOOK_SOURCE_MAP.length === PRODUCT_BOOK_HEADERS.length);
  assert(
    "Main Master still has 28 upload columns",
    PRODUCT_MASTER_HEADERS.length === 28,
    String(PRODUCT_MASTER_HEADERS.length),
  );

  console.log("\n=== Live Product Book (matches UI Ongoing gate) ===");
  assert("live book smaller than full seed", live.length < allProducts.length, `${live.length}/${allProducts.length}`);
  assert("live book non-empty", live.length > 2000, String(live.length));

  const sampleTargets = [
    live.find((p) => p.productName.includes("1567")),
    live.find((p) => /sensex/i.test(p.productName)),
    live[0],
    live[Math.floor(live.length / 2)],
  ].filter(Boolean) as ProductMaster[];

  const multiRows: string[][] = [];
  let quoteFailures = 0;
  for (let i = 0; i < live.length; i++) {
    const product = live[i]!;
    try {
      const result = unwindProduct(product, surface);
      const ok =
        Number.isFinite(result.unwindQuoteRs) &&
        result.optionRows.length === product.legs.length &&
        result.optionRows.every((row) => Number.isFinite(row.unwindPrice));
      if (!ok) quoteFailures += 1;
      multiRows.push(...productBookRows(product, result, i + 1, asOf));
    } catch {
      quoteFailures += 1;
    }
  }
  assert("every live product quote loads", quoteFailures === 0, String(quoteFailures));
  assert("Product Book row width = header count", multiRows.every((r) => r.length === PRODUCT_BOOK_HEADERS.length));
  assert(
    "Product Book uses ₹ or hyphen blanks (no em-dash / ellipsis)",
    multiRows.every((row) => row.every((cell) => cell !== "…" && cell !== "—" && cell !== "")),
  );

  for (const product of sampleTargets) {
    const result = unwindProduct(product, surface);
    const row = productBookRows(product, result, 1, asOf)[0] ?? [];
    const faceCol = PRODUCT_BOOK_HEADERS.indexOf("Face Value");
    assert(
      `sample ${product.productCode} name maps`,
      row[1] === (product.productName?.trim() || "-"),
    );
    assert(
      `sample ${product.productCode} face maps`,
      row[faceCol] === formatDeskRupees(product.faceValue),
    );
    assert(
      `sample ${product.productCode} leg rows`,
      productBookRows(product, result, 1, asOf).length === result.optionRows.length,
    );
    assert(
      `sample ${product.productCode} quote finite ₹`,
      row[3].startsWith("₹") && Number.isFinite(result.unwindQuoteRs),
    );
    const opt = optionBookRowsFlat(result);
    assert(
      `sample ${product.productCode} options rows = legs`,
      opt.length === product.legs.length,
      `${opt.length} vs ${product.legs.length}`,
    );
    assert(
      `sample ${product.productCode} options cols = 12`,
      opt.every((r) => r.length === OPTION_BOOK_HEADERS.length),
    );
  }

  console.log("\n=== Styled workbook builders (real export path) ===");
  const multiWb = await buildMultiProductBookWorkbook(PRODUCT_BOOK_HEADERS, multiRows.slice(0, 40));
  const multiSheet = multiWb.getWorksheet("Product Book");
  assert("multi sheet name Product Book", multiSheet?.name === "Product Book");
  assert("multi masthead maroon title", argbOf(multiSheet?.getCell("A2").fill) === EXCEL_THEME.maroonDeep);
  assert("multi masthead gold subtitle", argbOf(multiSheet?.getCell("A3").fill) === EXCEL_THEME.gold);

  let headerRowIdx = 0;
  multiSheet?.eachRow((row, number) => {
    const v = String(row.getCell(1).value ?? "");
    if (v === PRODUCT_BOOK_HEADERS[0]) headerRowIdx = number;
  });
  assert("multi table header row found", headerRowIdx > 0, String(headerRowIdx));
  if (headerRowIdx > 0 && multiSheet) {
    for (let c = 1; c <= PRODUCT_BOOK_HEADERS.length; c++) {
      const cell = multiSheet.getRow(headerRowIdx).getCell(c);
      assert(
        `multi header col ${c} label`,
        String(cell.value) === PRODUCT_BOOK_HEADERS[c - 1],
        String(cell.value),
      );
      assert(
        `multi header col ${c} maroonDeep`,
        argbOf(cell.fill) === EXCEL_THEME.maroonDeep,
      );
    }
  }
  const multiBuf = await multiWb.xlsx.writeBuffer();
  assert("multi Product Book xlsx non-empty", multiBuf.byteLength > 8_000, String(multiBuf.byteLength));

  const numericProduct = sampleTargets[0] ?? live[0];
  if (numericProduct) {
    const numericResult = unwindProduct(numericProduct, surface);
    const numericRows = buildProductBookExcelMatrix({
      serial: 1,
      product: numericProduct,
      asOf,
      quote: quoteViewFromUnwind(numericResult, asOf),
    });
    const numericWb = await buildMultiProductBookWorkbook(PRODUCT_BOOK_HEADERS, numericRows);
    const numericSheet = numericWb.getWorksheet("Product Book");
    let numericHeader = 0;
    numericSheet?.eachRow((row, number) => {
      if (String(row.getCell(1).value ?? "") === "Sr. No.") numericHeader = number;
    });
    const quoteCell = numericSheet?.getRow(numericHeader + 1).getCell(PRODUCT_BOOK_HEADERS.indexOf("Unwind Quote Amount") + 1);
    const priceCell = numericSheet?.getRow(numericHeader + 1).getCell(PRODUCT_BOOK_HEADERS.indexOf("Unwind Option Price") + 1);
    const dateCell = numericSheet?.getRow(numericHeader + 1).getCell(PRODUCT_BOOK_HEADERS.indexOf("Option Expiry Date") + 1);
    const rateCell = numericSheet?.getRow(numericHeader + 1).getCell(PRODUCT_BOOK_HEADERS.indexOf("Client Internal Rate of Return") + 1);
    assert("product book quote is a number", typeof quoteCell?.value === "number", String(quoteCell?.value));
    assert("product book quote format is rupees", String(quoteCell?.numFmt ?? "").includes("₹"), String(quoteCell?.numFmt));
    assert("product book option price is a number", typeof priceCell?.value === "number", String(priceCell?.value));
    assert("product book expiry is a date", dateCell?.value instanceof Date, String(dateCell?.value));
    assert("product book IRR is a percent number", typeof rateCell?.value === "number" && String(rateCell?.numFmt) === "0.00%", String(rateCell?.numFmt));

    // Active Management columns: a synthetic priced row, so the formats are checked without the quotes API.
    const amQuote = {
      ...quoteViewFromUnwind(numericResult, asOf),
      am: {
        actualTarget: 24000,
        actualTargetSource: "Top Sell Put Strike" as const,
        effectiveTarget: 24150.5,
        observationsTotal: 4,
        observationsPassed: 1,
        observationsLeft: 3,
        observationStartDate: "2026-03-30",
        observationEndDate: "2027-09-29",
        nextObservationDate: "2026-12-30",
        averageSoFar: 23550.25,
        observationStatus: "Observations Live" as const,
        maxIrr: 0.12,
        currentIrr: 0.1,
        assumedLevel: 25000,
        expectedQuoteRs: 101000,
        expectedIrr: 0.11,
        expectedDifferenceRs: -1234567.891,
        pendingObservations: "Dec-26, Mar-27 & Sep-27",
        exitValueRs: 98765432.1,
        expectedExitValueRs: 99000000,
        warnings: [],
      },
    };
    const amScreen = buildProductBookMatrix({ serial: 1, product: numericProduct, asOf, quote: amQuote }).rows;
    const amScreenCell = (header: (typeof ACTIVE_MANAGEMENT_BOOK_HEADERS)[number]) =>
      amScreen[0]?.[PRODUCT_BOOK_HEADERS.indexOf(header)];
    assert("screen current IRR is a percent", amScreenCell("Current Internal Rate of Return") === "10.00%", amScreenCell("Current Internal Rate of Return"));
    assert("screen effective target is a level", amScreenCell("Effective Target") === "24,150.50", amScreenCell("Effective Target"));
    assert("screen observation start is a desk date", amScreenCell("Observation Start Date") === "30-Mar-26", amScreenCell("Observation Start Date"));
    assert("screen Expected Internal Rate of Return is a percent", amScreenCell("Expected Internal Rate of Return") === "11.00%", amScreenCell("Expected Internal Rate of Return"));
    assert("screen Expected Difference is rupees to the paisa", amScreenCell("Expected Difference") === "₹ -12,34,567.89", amScreenCell("Expected Difference"));
    assert("screen Exit Value is rupees to the paisa", amScreenCell("Exit Value") === "₹ 9,87,65,432.10", amScreenCell("Exit Value"));
    assert("screen Pending Observations is the month list", amScreenCell("Pending Observations") === "Dec-26, Mar-27 & Sep-27", amScreenCell("Pending Observations"));
    assert("screen Mobilization is the master amount in rupees", amScreenCell("Mobilization") === formatDeskRupees(numericProduct.mobilization), amScreenCell("Mobilization"));
    const pendingMobilization = buildProductBookMatrix({ serial: 1, product: numericProduct, asOf, quote: null }).rows[0] ?? [];
    assert(
      "Mobilization shows while the quote is pending",
      pendingMobilization[PRODUCT_BOOK_HEADERS.indexOf("Mobilization")] === formatDeskRupees(numericProduct.mobilization) &&
        pendingMobilization[PRODUCT_BOOK_HEADERS.indexOf("Exit Value")] === "…",
    );
    const staleScreen = buildProductBookMatrix({ serial: 1, product: numericProduct, asOf, quote: amQuote, expectedPending: true }).rows[0] ?? [];
    const staleCell = (header: (typeof ACTIVE_MANAGEMENT_BOOK_HEADERS)[number]) => staleScreen[PRODUCT_BOOK_HEADERS.indexOf(header)];
    assert(
      "a stale expected level shows Expected Internal Rate of Return and Expected Difference as pending",
      staleCell("Expected Internal Rate of Return") === "…" && staleCell("Expected Difference") === "…",
    );
    assert(
      "a stale expected level keeps every other cell",
      ACTIVE_MANAGEMENT_BOOK_HEADERS.filter((h) => h !== "Expected Internal Rate of Return" && h !== "Expected Difference").every(
        (h) => staleCell(h) === amScreenCell(h),
      ) && staleScreen.slice(0, -ACTIVE_MANAGEMENT_BOOK_HEADERS.length).join("|") === amScreen[0]!.slice(0, -ACTIVE_MANAGEMENT_BOOK_HEADERS.length).join("|"),
    );
    const blankAm = buildProductBookMatrix({
      serial: 1,
      product: numericProduct,
      asOf,
      quote: { ...amQuote, am: { ...amQuote.am, pendingObservations: null, expectedDifferenceRs: null, exitValueRs: null } },
    }).rows[0] ?? [];
    assert(
      "missing Expected Difference, Exit Value and Pending Observations show a hyphen",
      (["Expected Difference", "Exit Value", "Pending Observations"] as const).every((h) => blankAm[PRODUCT_BOOK_HEADERS.indexOf(h)] === "-"),
    );
    assert(
      "screen Active Management cells repeat on every leg row",
      amScreen.every((row) => row.slice(-ACTIVE_MANAGEMENT_BOOK_HEADERS.length).join("|") === amScreen[0]!.slice(-ACTIVE_MANAGEMENT_BOOK_HEADERS.length).join("|")),
    );
    const amWb = await buildMultiProductBookWorkbook(
      PRODUCT_BOOK_HEADERS,
      buildProductBookExcelMatrix({ serial: 1, product: numericProduct, asOf, quote: amQuote }),
    );
    const amSheet = amWb.getWorksheet("Product Book");
    let amHeader = 0;
    amSheet?.eachRow((row, number) => {
      if (String(row.getCell(1).value ?? "") === "Sr. No.") amHeader = number;
    });
    const amCell = (header: (typeof ACTIVE_MANAGEMENT_BOOK_HEADERS)[number], offset = 1) =>
      amSheet?.getRow(amHeader + offset).getCell(PRODUCT_BOOK_HEADERS.indexOf(header) + 1);
    for (const header of ["Current Internal Rate of Return", "Expected Internal Rate of Return"] as const) {
      assert(`${header} is a percent number`, typeof amCell(header)?.value === "number" && String(amCell(header)?.numFmt) === "0.00%", String(amCell(header)?.numFmt));
    }
    for (const header of ["Expected Difference", "Exit Value", "Mobilization"] as const) {
      assert(`${header} is a rupee number`, typeof amCell(header)?.value === "number" && String(amCell(header)?.numFmt) === '"₹"#,##0.00', String(amCell(header)?.numFmt));
    }
    assert("Expected Difference keeps the unrounded value", amCell("Expected Difference")?.value === -1234567.891, String(amCell("Expected Difference")?.value));
    assert("Pending Observations is text", amCell("Pending Observations")?.value === "Dec-26, Mar-27 & Sep-27", String(amCell("Pending Observations")?.value));
    for (const header of ["Actual Target", "Effective Target", "Average So Far"] as const) {
      assert(`${header} is a two-decimal number`, typeof amCell(header)?.value === "number" && String(amCell(header)?.numFmt) === "#,##0.00", String(amCell(header)?.numFmt));
    }
    for (const header of ["Observations Passed", "Observations Left"] as const) {
      assert(`${header} is a whole number`, typeof amCell(header)?.value === "number" && String(amCell(header)?.numFmt) === "#,##0", String(amCell(header)?.numFmt));
    }
    for (const header of ["Observation Start Date", "Observation End Date", "Next Observation Date"] as const) {
      assert(`${header} is a date`, amCell(header)?.value instanceof Date, String(amCell(header)?.value));
    }
    assert("Observation Status is text", amCell("Observation Status")?.value === "Observations Live", String(amCell("Observation Status")?.value));
    if (numericResult.optionRows.length > 1) {
      for (const header of ACTIVE_MANAGEMENT_BOOK_HEADERS) {
        assert(`${header} merges across the product's legs`, amCell(header, 2)?.isMerged === true);
      }
      const legPrice = amSheet?.getRow(amHeader + 2).getCell(PRODUCT_BOOK_HEADERS.indexOf("Unwind Option Price") + 1);
      assert("Unwind Option Price stays one cell per leg", legPrice?.isMerged !== true);
    }
    const unpricedAm = buildProductBookExcelMatrix({ serial: 1, product: numericProduct, asOf, quote: quoteViewFromUnwind(numericResult, asOf) });
    const mobilizationAt = ACTIVE_MANAGEMENT_BOOK_HEADERS.indexOf("Mobilization");
    assert(
      "quote without Active Management fields exports hyphens, Mobilization still the master amount",
      unpricedAm.every((row) =>
        row
          .slice(-ACTIVE_MANAGEMENT_BOOK_HEADERS.length)
          .every((cell, i) => (i === mobilizationAt ? cell === numericProduct.mobilization : cell === "-")),
      ),
    );
  }

  console.log("\n=== Book Scenario Table download ===");
  {
    const [priced, failed] = [live[0]!, live[1]!];
    const scenarioRow: BookScenarioRow = {
      underlying: "Nifty",
      baseSpot: 24366.55,
      cells: BOOK_SCENARIO_SHIFTS.map((shift) => ({
        shift,
        level: 24366.55 + shift,
        unwindQuoteRs: 100000 + shift * 10.123,
        premiumOutflowRs: -5000 - shift,
        unwindValueRs: 9_000_000 + shift * 1000,
        exitValueRs: 9_000_500 + shift * 1000,
        currentIrr: shift === 1000 ? null : 0.1 + shift / 100000,
        expectedDifferenceRs: 1234.567 + shift,
      })),
    };
    const rows: Record<string, BookScenarioRow | null> = { [productKey(priced)]: scenarioRow, [productKey(failed)]: null };
    assert("scenario headers: 4 identity columns and 21 levels", BOOK_SCENARIO_HEADERS.length === 25, String(BOOK_SCENARIO_HEADERS.length));
    assert(
      "scenario level headers run −1,000 … 0 … +1,000",
      BOOK_SCENARIO_HEADERS[4] === "−1,000" && BOOK_SCENARIO_HEADERS[BOOK_SCENARIO_CENTRE_COL] === "0" && BOOK_SCENARIO_HEADERS[24] === "+1,000",
      BOOK_SCENARIO_HEADERS.slice(4).join(","),
    );
    const metric = (id: (typeof BOOK_SCENARIO_METRICS)[number]["id"]) => BOOK_SCENARIO_METRICS.find((m) => m.id === id)!;
    const screen = bookScenarioDisplayRow(priced, scenarioRow, metric("unwindQuote"));
    assert("scenario screen quote is rupees to the paisa", screen[BOOK_SCENARIO_CENTRE_COL] === "₹ 1,00,000.00", screen[BOOK_SCENARIO_CENTRE_COL]);
    assert("scenario screen base level", screen[3] === "24,366.55", screen[3]);
    const change = bookScenarioDisplayRow(priced, scenarioRow, metric("unwindQuoteChange"));
    assert("scenario change is against the 0 column", change[BOOK_SCENARIO_CENTRE_COL] === "₹ 0.00" && change[BOOK_SCENARIO_CENTRE_COL + 1] === "₹ 1,012.30", change.slice(BOOK_SCENARIO_CENTRE_COL).join(" "));
    const rate = bookScenarioDisplayRow(priced, scenarioRow, metric("currentIrrChange"));
    assert("scenario rate change is a percent; a blank rate is a hyphen", rate[4] === "-1.00%" && rate[24] === "-", `${rate[4]} ${rate[24]}`);
    assert("a pending scenario row shows …", bookScenarioDisplayRow(priced, undefined, metric("unwindQuote")).slice(3).every((v) => v === "…"));
    assert("a failed scenario row shows -", bookScenarioDisplayRow(failed, null, metric("unwindQuote")).slice(3).every((v) => v === "-"));

    const scenarioWb = await buildBookScenarioWorkbook([priced, failed], rows, { viewNote: "Export View · Ongoing" });
    const names = scenarioWb.worksheets.map((ws) => ws.name);
    assert("scenario workbook has one sheet per metric", names.join("|") === BOOK_SCENARIO_METRICS.map((m) => m.sheet).join("|"), names.join("|"));
    assert("scenario sheet names fit Excel's 31 characters", names.every((name) => name.length <= 31) && new Set(names).size === 9);
    for (const sheet of scenarioWb.worksheets) {
      let header = 0;
      sheet.eachRow((row, number) => {
        if (String(row.getCell(1).value ?? "") === "Product Name") header = number;
      });
      const labels = BOOK_SCENARIO_HEADERS.map((_, i) => String(sheet.getRow(header).getCell(i + 1).value ?? ""));
      assert(`${sheet.name} header row`, header > 0 && labels.join("|") === BOOK_SCENARIO_HEADERS.join("|"));
      const def = BOOK_SCENARIO_METRICS.find((m) => m.sheet === sheet.name)!;
      const centre = sheet.getRow(header + 1).getCell(BOOK_SCENARIO_CENTRE_COL + 1);
      const fmt = def.kind === "rupees" ? '"₹"#,##0.00' : "0.00%";
      assert(`${sheet.name} level cells are ${def.kind} numbers`, typeof centre.value === "number" && String(centre.numFmt) === fmt, `${centre.value} ${centre.numFmt}`);
      assert(`${sheet.name} 0 column is shaded`, argbOf(centre.fill) === EXCEL_THEME.goldSoft);
      const base = sheet.getRow(header + 1).getCell(4);
      assert(`${sheet.name} base level is a number`, base.value === 24366.55 && String(base.numFmt) === "#,##0.00", `${base.value} ${base.numFmt}`);
      const failedCells = BOOK_SCENARIO_HEADERS.slice(3).map((_, i) => sheet.getRow(header + 2).getCell(i + 4).value);
      assert(`${sheet.name} failed product exports hyphens`, failedCells.every((v) => v === "-"));
      if (def.change) assert(`${sheet.name} 0 column is zero`, centre.value === 0, String(centre.value));
    }
    const quoteSheet = scenarioWb.getWorksheet("Unwind Quote Amount");
    let quoteHeader = 0;
    quoteSheet?.eachRow((row, number) => {
      if (String(row.getCell(1).value ?? "") === "Product Name") quoteHeader = number;
    });
    const top = quoteSheet?.getRow(quoteHeader + 1).getCell(25).value;
    assert("scenario +1,000 quote is the unrounded cell", top === 100000 + 1000 * 10.123, String(top));
    const scenarioBuf = await scenarioWb.xlsx.writeBuffer();
    assert("scenario xlsx non-empty", scenarioBuf.byteLength > 8_000, String(scenarioBuf.byteLength));
  }

  const singleResult = unwindProduct(single, surface);
  const singleWb = await buildUnwindScreenWorkbook(singleResult);
  assert(
    "unwind sheets",
    singleWb.worksheets.map((ws) => ws.name).join(",") === "Unwinding Summary,Options Book",
    singleWb.worksheets.map((ws) => ws.name).join(","),
  );
  const optSheet = singleWb.getWorksheet("Options Book");
  let optHeaderRow = 0;
  optSheet?.eachRow((row, number) => {
    if (String(row.getCell(1).value ?? "") === OPTION_BOOK_HEADERS[0]) optHeaderRow = number;
  });
  assert("options header row found", optHeaderRow > 0);
  if (optHeaderRow > 0 && optSheet) {
    for (let c = 1; c <= OPTION_BOOK_HEADERS.length; c++) {
      assert(
        `options header ${c}`,
        String(optSheet.getRow(optHeaderRow).getCell(c).value) === OPTION_BOOK_HEADERS[c - 1],
      );
    }
    assert(
      "options header maroonDeep",
      argbOf(optSheet.getRow(optHeaderRow).getCell(1).fill) === EXCEL_THEME.maroonDeep,
    );
    let putCallRows = 0;
    optSheet.eachRow((row, number) => {
      if (number <= optHeaderRow) return;
      const v = String(row.getCell(1).value ?? "");
      if (v === "Put" || v === "Call") putCallRows += 1;
    });
    assert("options Put/Call rows = 24 legs", putCallRows === 24, String(putCallRows));
    const optionPrice = optSheet.getRow(optHeaderRow + 1).getCell(OPTION_BOOK_HEADERS.indexOf("Unwind Option Price") + 1);
    assert("options price is a number", typeof optionPrice.value === "number", String(optionPrice.value));
    assert("options price format is numeric", String(optionPrice.numFmt ?? "") === "#,##0.00", String(optionPrice.numFmt));
  }

  const pricerRows = priceProductBook({
    product: single,
    surface,
    valuationDate: "2025-02-21",
    spot: 22800,
    bidAskSpread: 0,
  });
  const pricerWb = await buildPricerScreenWorkbook(pricerRows, single.productCode);
  const pricerSheet = pricerWb.getWorksheet("Pricer Table");
  assert("pricer sheet name", pricerSheet?.name === "Pricer Table");
  let pricerHeader = 0;
  pricerSheet?.eachRow((row, number) => {
    if (String(row.getCell(1).value ?? "") === PRICER_TABLE_HEADERS[0]) pricerHeader = number;
  });
  assert("pricer header found", pricerHeader > 0);
  if (pricerHeader > 0 && pricerSheet) {
    assert(
      "pricer has 14 header labels",
      PRICER_TABLE_HEADERS.every((h, i) => String(pricerSheet.getRow(pricerHeader).getCell(i + 1).value) === h),
    );
  }

  console.log("\n=== Dynamic columns + no cell indent (all screen Excel downloads) ===");
  const sheetsToCheck = [
    { name: "Product Book", sheet: multiSheet },
    { name: "Options Book", sheet: optSheet },
    { name: "Pricer Table", sheet: pricerSheet },
    { name: "Unwinding Summary", sheet: singleWb.getWorksheet("Unwinding Summary") },
  ];
  for (const { name, sheet } of sheetsToCheck) {
    assert(`${name} sheet present`, Boolean(sheet));
    if (!sheet) continue;
    let indentHits = 0;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const indent = Number((cell.alignment as { indent?: number } | undefined)?.indent ?? 0);
        if (indent > 0) indentHits += 1;
      });
    });
    assert(`${name} has zero cell indent`, indentHits === 0, String(indentHits));

    const widths: number[] = [];
    sheet.columns.forEach((col) => {
      if (!col || col.width == null) return;
      widths.push(Number(col.width));
    });
    assert(`${name} has dynamic column widths`, widths.length > 0, String(widths.length));
    assert(
      `${name} widths are content-sized with date floor (no ####)`,
      widths.every((w) => Number.isFinite(w) && w >= 4 && w <= 60),
      widths.slice(0, 8).join(","),
    );
    const dateWidths = widths.filter((_, i) => {
      const header = String(sheet.getRow(1).getCell(i + 1).value ?? "");
      return /\bdate\b/i.test(header);
    });
    // Banner row 1 is not the table header — scan for date-formatted / dd-mmm cells instead.
    let sawDateFloor = false;
    sheet.columns.forEach((col) => {
      if (!col || typeof col.eachCell !== "function" || col.width == null) return;
      let isDate = false;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v instanceof Date) isDate = true;
        if (typeof v === "string" && /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(v.trim())) isDate = true;
        const fmt = String(cell.numFmt ?? "");
        if (/[dym]/i.test(fmt) && /mmm|yyyy|yy|dd/i.test(fmt)) isDate = true;
      });
      if (isDate) {
        sawDateFloor = true;
        assert(`${name} date column width >= 12`, Number(col.width) >= 12, String(col.width));
      }
    });
    void dateWidths;
    void sawDateFloor;
    assert(
      `${name} is not capped flat at max from merged banners`,
      widths.some((w) => w < 40),
      widths.join(","),
    );
    assert(`${name} has at least one column wider than a short label`, widths.some((w) => w > 3), widths.join(","));
  }

  console.log("\n=== Reference XLSM Main Master ↔ seed / Product Book ===");
  const seedCodes = new Set(allProducts.map((p) => (p.productCode || productKey(p)).trim().toUpperCase()));
  for (const file of XLSM_FILES) {
    const label = path.basename(file).slice(0, 52);
    assert(`XLSM present ${label}`, fs.existsSync(file));
    if (!fs.existsSync(file)) continue;
    const parsed = parseProductMasterBook(fs.readFileSync(file)).filter((p) => p.legs.length > 0);
    const missing = parsed.filter((p) => !seedCodes.has((p.productCode || productKey(p)).trim().toUpperCase()));
    assert(`${label} ISINs ⊆ seed`, missing.length === 0, String(missing.length));
    const probe = parsed.find((p) => p.faceValue > 0) ?? parsed[0];
    if (probe) {
      const inSeed = allProducts.find(
        (p) => (p.productCode || "").trim().toUpperCase() === (probe.productCode || "").trim().toUpperCase(),
      );
      if (inSeed) {
        assert(
          `${label} face maps into seed`,
          Math.abs(inSeed.faceValue - probe.faceValue) < 1e-6,
          `${inSeed.faceValue} vs ${probe.faceValue}`,
        );
        assert(
          `${label} name present on seed`,
          inSeed.productName.trim().length > 0,
        );
      }
    }
  }

  if (failures > 0) {
    console.error(`\nDownload pipeline FAILED (${failures})`);
    process.exit(1);
  }
  console.log("\nDownload pipeline PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
