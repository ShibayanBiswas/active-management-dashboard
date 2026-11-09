/**
 * Edge case checks for the unwind engine:
 * 1. Expired puts: Sell → (spot−strike) signed; Buy → 0. Calls: max(spot−strike,0).
 * 2. Unwind on the allotment date — zero invested tenor must not produce NaN or Infinity.
 * 3. Unwind before allotment — invested tenor clamps to zero.
 * 4. Every numeric output is finite for extreme spots.
 */
import { computeUnwind, expiredIntrinsicMark, expiredSellPutMark } from "../lib/engine/unwind";
import { bookPremiumFraction } from "../lib/engine/product-premium";
import { priceLeg } from "../lib/engine/pricer";
import { collectExpiredLegExpiryDates } from "../lib/engine/expiry-spots";
import {
  AUGUST_REFERENCE_SENSEX_PRICE,
  AUGUST_REFERENCE_UNDERLYING_PRICE,
  DEFAULT_FWD_SELL_RATE,
  INDEX_STRIKE_PRICE_DECIMALS,
  interpolateVolPercent,
  moneynessStrikes,
  normalizeVolSurface,
  labelSurfaceForDeskMonth,
  referenceSensexPrice,
  referenceUnderlyingPrice,
} from "../lib/engine/vol-surface";
import { pickDeskClose } from "../lib/market-data";
import { dedupeOptionLegs, optionLegCloneKey } from "../lib/multi/leg-position";
import { oldestObservationYmd, productMatchesObservationRange } from "../lib/multi/observation-date-filter";
import { pickCarriedVolSurface } from "../lib/data/load";
import { expiryForObservationTab, observationDatesForProduct, productHasObservationTab, productsForObservationTab, productsWithLiveMaturity, remainingObservationDays, LIVE_OBSERVATION_TAB_ORDER, OBSERVATION_TAB_ORDER } from "../lib/observation-tabs";
import type { ProductMaster, VolSurface } from "../lib/types";
import productSeed from "../lib/data/product-master-seed.json";
import multiSeed from "../lib/data/multi-products-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import goldenSepSurface from "../lib/data/vol-surface-golden-sep-2026.json";
import { parseISODate, underlyingFromProductName, computeGroupedRowSpans, computeRowSpans, deskTodayISO, formatNumber, roundDeskMoney } from "../lib/utils";
import { OPTION_BOOK_HEADERS, POST_OBSERVATION_HEADERS, PRODUCT_BOOK_HEADERS } from "../lib/workbook/export-columns";
import { allOptionExpiriesPassed, amountWithNbfcRupees, postObservationDisplayRow, postObservationFigures } from "../lib/multi/post-observation";
import { premiumOutflowInWindow } from "../lib/workbook/product-book-rows";
import { buildProductBookMatrix, clubProductBookDisplay } from "../lib/workbook/product-book-rows";
import { PRODUCT_BOOK_MERGE_COLS } from "../lib/workbook/table-merge";

const product = productSeed as ProductMaster;
const surface = volSeed as VolSurface;
/** September 2026 surface: Excel Main Master references and a previous-month carry. */
const septemberSurface = goldenSepSurface as VolSurface;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function allFinite(obj: Record<string, unknown>, prefix: string) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") {
      check(`${prefix}.${k} finite`, Number.isFinite(v), String(v));
    }
  }
}

// 1. Expired options: intrinsic at the expiry spot. Sell pays (negative). Buy receives
//    (positive). OTM is 0. Pricer stays 0.
{
  const spot = 22800;
  const result = computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: "2028-01-15", spot },
  });
  let sellPutOutflow = 0;
  let buyInflow = 0;
  let expectedKpi = 0;
  for (const row of result.optionRows) {
    const isCall = row.options.toLowerCase().startsWith("c");
    const buy = row.original.trim().toLowerCase() === "buy";
    const sellPut = !isCall && !buy;
    const intrinsic = expiredIntrinsicMark(spot, row.strike, isCall);
    const expectedOutflow = Math.round(intrinsic * row.quantity * 100) / 100;
    if (sellPut) sellPutOutflow += row.premiumOutflowRs;
    if (buy && intrinsic > 0) buyInflow += row.premiumOutflowRs;
    check(
      `expired leg ${row.strike} ${row.expiry.slice(0, 7)} ${row.original}`,
      row.unwindPrice === intrinsic &&
        row.unwindPrice >= 0 &&
        Math.abs(row.premiumOutflowRs - expectedOutflow) < 1e-9 &&
        (buy && intrinsic > 0 ? row.premiumOutflowRs > 0 : true),
      `price ${row.unwindPrice} outflow ${row.premiumOutflowRs}`,
    );
    check(`expired flag ${row.strike} ${row.expiry.slice(0, 7)}`, row.expired === true);
  }
  check("expired ITM buy option inflow is positive", buyInflow > 0, String(buyInflow));
  check(
    "expired ITM sell put intrinsic is strike minus spot",
    expiredSellPutMark(22800, 23408) === 608,
    String(expiredSellPutMark(22800, 23408)),
  );
  check(
    "expired OTM sell put intrinsic is 0",
    expiredSellPutMark(22800, 14960) === 0,
    String(expiredSellPutMark(22800, 14960)),
  );
  // Reconstruct KPI from required quantity path via engine result identity.
  const legCashSum = result.optionRows.reduce((sum, row) => sum + row.premiumOutflowRs, 0);
  check(
    "net Premium Outflow is the sum of every leg cash amount",
    Math.abs(result.masterEconomics.premiumOutflowRs - legCashSum) < 0.02,
    `${result.masterEconomics.premiumOutflowRs} vs ${legCashSum}`,
  );
  check(
    "expired sell-put intrinsic enters Premium Outflow KPI",
    Math.abs(result.masterEconomics.premiumOutflowRs) > 0 || sellPutOutflow === 0,
    String(result.masterEconomics.premiumOutflowRs),
  );
  check(
    "Unwind Value includes Premium Outflow",
    Math.abs(
      result.masterEconomics.unwindValueRs -
        (result.masterEconomics.grownValueRs +
          result.masterEconomics.premGrownValueRs +
          result.masterEconomics.premiumOutflowRs),
    ) < 0.02,
    String(result.masterEconomics.unwindValueRs),
  );
  void expectedKpi;
  check(
    "expired sell-put row cash stays on the Options Book",
    Math.abs(sellPutOutflow) > 0 || result.optionRows.every((r) => {
      const sp = r.options.toLowerCase().startsWith("p") && r.original.trim().toLowerCase() === "sell";
      return !sp || r.unwindPrice === 0;
    }),
    String(sellPutOutflow),
  );
}

// 2. Expired leg via priceLeg: sell and buy are 0; delta 0
{
  const sellLeg = { ...product.legs[0], originalSide: "Sell" };
  const buyLeg = { ...product.legs[0], originalSide: "Buy" };
  const sellPriced = priceLeg({
    leg: sellLeg,
    spot: 20000,
    valuationDate: parseISODate("2028-01-15"),
    surface,
    bidAskSpread: 0.02,
  });
  const buyPriced = priceLeg({
    leg: buyLeg,
    spot: 20000,
    valuationDate: parseISODate("2028-01-15"),
    surface,
    bidAskSpread: 0.02,
  });
  check("expired sell put price is 0", sellPriced.price === 0);
  check(
    "expired sell put sell = buy = 0",
    sellPriced.sellPrice === 0 && sellPriced.buyPrice === 0,
  );
  check("expired buy put price is 0", buyPriced.price === 0 && buyPriced.sellPrice === 0 && buyPriced.buyPrice === 0);
  check("expired priceLeg delta = 0", sellPriced.delta === 0 && buyPriced.delta === 0);
  check("expired implied volatility is 0", sellPriced.volatility === 0 && buyPriced.volatility === 0);
  check("expired vol bump is 0", sellPriced.volBump === 0 && buyPriced.volBump === 0);
  check("expired forward growth is 0", sellPriced.forwardGrowth === 0 && buyPriced.forwardGrowth === 0);
  check("expired discount yield is 0", sellPriced.discountYield === 0 && buyPriced.discountYield === 0);
  check("expired bid offer is 0", sellPriced.bidOffer === 0 && buyPriced.bidOffer === 0);
  check("expired flag is true", sellPriced.expired === true && buyPriced.expired === true);
}

// 3. Unwind on the allotment date: invested 0, no NaN
{
  const result = computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: product.allotmentDate.slice(0, 10), spot: 17800 },
  });
  check("allotment-day invested tenor = 0", result.investedTenorDays === 0);
  check("allotment-day client IRR finite", Number.isFinite(result.clientIRR));
  allFinite(result.masterEconomics as unknown as Record<string, unknown>, "allotment-day economics");
}

// 4. Unwind before allotment clamps invested to zero
{
  const result = computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: "2023-01-01", spot: 17800 },
  });
  check("pre-allotment invested clamped to 0", result.investedTenorDays === 0);
}

// 5. Extreme spots stay finite
for (const spot of [1, 100000]) {
  const result = computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: "2025-02-21", spot },
  });
  check(`spot ${spot} quote finite`, Number.isFinite(result.unwindQuotePct));
  check(`spot ${spot} rows finite`, result.optionRows.every((r) => Number.isFinite(r.unwindPrice)));
}

{
  const expiry = parseISODate("2027-02-25");
  const base = interpolateVolPercent(surface, 23408, expiry, 22800);
  const reversed: VolSurface = {
    ...surface,
    expiries: [...surface.expiries].reverse(),
    volsPercent: [...surface.volsPercent].reverse(),
  };
  const reversedVol = interpolateVolPercent(reversed, 23408, expiry, 22800);
  check("reversed expiry rows keep the same vol", Math.abs(base - reversedVol) < 1e-9, `${base} vs ${reversedVol}`);

  const money = [...surface.moneyness];
  const flipped = money.map((_, i) => money[money.length - 1 - i]);
  const flippedRows = surface.volsPercent.map((row) => [row[0], ...row.slice(1).reverse()]);
  const flippedSurface: VolSurface = { ...surface, moneyness: flipped, volsPercent: flippedRows };
  const flippedVol = interpolateVolPercent(flippedSurface, 23408, expiry, 22800);
  check("reversed strike columns keep the same vol", Math.abs(base - flippedVol) < 1e-9, `${base} vs ${flippedVol}`);
}

{
  const stripped: ProductMaster = { ...product, premiumFraction: undefined };
  const derived = bookPremiumFraction(stripped);
  check(
    "premium fraction from the option book is 53.53%",
    Math.abs(derived - 0.5353413402415197) < 1e-9,
    String(derived),
  );
  const withField = computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: "2025-02-21", spot: 22800 },
  });
  const withoutField = computeUnwind({
    product: stripped,
    surface,
    inputs: { debentures: 800, unwindDate: "2025-02-21", spot: 22800 },
  });
  check(
    "missing premiumFraction does not change the quote",
    Math.abs(withField.unwindQuotePct - withoutField.unwindQuotePct) < 1e-12,
    `${withField.unwindQuotePct} vs ${withoutField.unwindQuotePct}`,
  );

  const negativeStored: ProductMaster = { ...product, premiumFraction: -0.5353413402415197 };
  check(
    "negative stored premiumFraction is absolute-positive",
    Math.abs(bookPremiumFraction(negativeStored) - 0.5353413402415197) < 1e-12,
    String(bookPremiumFraction(negativeStored)),
  );
  const negUnwind = computeUnwind({
    product: negativeStored,
    surface,
    inputs: { debentures: 800, unwindDate: "2025-02-21", spot: 22800 },
  });
  check(
    "negative stored Premium Credited Rs stays positive",
    negUnwind.masterEconomics.premiumCreditedRs > 0,
    String(negUnwind.masterEconomics.premiumCreditedRs),
  );
  check(
    "negative stored Premium Credited matches absolute golden",
    Math.abs(negUnwind.masterEconomics.premiumCreditedRs - 128013497.9852534) < 1,
    String(negUnwind.masterEconomics.premiumCreditedRs),
  );

  const flippedLegs: ProductMaster = {
    ...product,
    premiumFraction: undefined,
    legs: product.legs.map((leg) => ({
      ...leg,
      reqQuantity: leg.reqQuantity == null ? leg.reqQuantity : -leg.reqQuantity,
      originalSide: String(leg.originalSide).toLowerCase().startsWith("s") ? "Buy" : "Sell",
    })),
  };
  check(
    "sign-flipped option book still yields positive premiumFraction",
    bookPremiumFraction(flippedLegs) > 0,
    String(bookPremiumFraction(flippedLegs)),
  );
  check(
    "sign-flipped option book matches absolute book premium",
    Math.abs(bookPremiumFraction(flippedLegs) - 0.5353413402415197) < 1e-9,
    String(bookPremiumFraction(flippedLegs)),
  );
}

check("Nifty Accelerator defaults to Nifty", underlyingFromProductName("Nifty Accelerator - 961") === "Nifty");
check("Sensex in name selects Sensex", underlyingFromProductName("Sensex Accelerator - 12") === "Sensex");
check("SENSEX any case selects Sensex", underlyingFromProductName("SENSEX Dual 50") === "Sensex");
check("Sensex glued to next word selects Sensex", underlyingFromProductName("SensexAccelerator") === "Sensex");
check("BSE Sensex in name selects Sensex", underlyingFromProductName("BSE Sensex Dual 50") === "Sensex");
check("S&P BSE Sensex selects Sensex", underlyingFromProductName("S&P BSE Sensex Note") === "Sensex");
check("No Sensex in name stays Nifty", underlyingFromProductName("Bank Nifty Plus") === "Nifty");
check("Sensex in code selects Sensex", underlyingFromProductName("Index Note", "SENSEX-ARG") === "Sensex");
check("SPSX product code selects Sensex", underlyingFromProductName("Nifty Book", "ARG26SPSX45") === "Sensex");
check("spsx fragment in code selects Sensex", underlyingFromProductName("Index Book", "FOO-spsx-1") === "Sensex");
check("SPSX alone in code selects Sensex", underlyingFromProductName("", "SPSX") === "Sensex");
check("Nifty code without Sensex stays Nifty", underlyingFromProductName("Dual Barrier", "ARG26NIFTY12") === "Nifty");

// Desk Book multi-product merges must not cross Sr. No. (Face Value / costs are shared).
{
  const matrix = [
    ["1", "Prod A", "5.94%", "1,25,000"],
    ["1", "Prod A", "5.94%", "1,25,000"],
    ["2", "Prod B", "8.99%", "1,25,000"],
    ["2", "Prod B", "8.99%", "1,25,000"],
  ];
  const broken = computeRowSpans(matrix);
  check(
    "ungrouped Face Value wrongly spans both products",
    (broken[0]?.[3] ?? 0) === 4,
    String(broken[0]?.[3]),
  );
  const fixed = computeGroupedRowSpans(matrix, [0, 1, 2, 3], 0);
  check("grouped Face Value stays inside product 1", (fixed[0]?.[3] ?? 0) === 2, String(fixed[0]?.[3]));
  check("grouped Face Value restarts on product 2", (fixed[2]?.[3] ?? 0) === 2, String(fixed[2]?.[3]));
  check("grouped inbuilt visible on product 2 first row", (fixed[2]?.[2] ?? 0) === 2, String(fixed[2]?.[2]));
  check("product 2 second row covered by inbuilt span", (fixed[3]?.[2] ?? 0) === 0, String(fixed[3]?.[2]));
}

// Desk spot: NSE session-aware close selection
{
  const bars = [
    { dateYmd: "2026-08-10", close: 24500 },
    { dateYmd: "2026-08-11", close: 24600 },
    { dateYmd: "2026-08-12", close: 24700 },
  ];

  // Wednesday 12 Aug 2026 11:00 IST (UTC+5:30) → during session → prior close
  const midSession = new Date("2026-08-12T05:30:00.000Z");
  const openPick = pickDeskClose(bars, midSession);
  check("open session uses prior close", openPick?.spotKind === "prior_close", openPick?.spotKind);
  check("open session as-of prior day", openPick?.priceAsOfDate === "2026-08-11", openPick?.priceAsOfDate);
  check("open session level is prior", openPick?.close === 24600, String(openPick?.close));
  check("open session phase is open", openPick?.sessionPhase === "open", openPick?.sessionPhase);

  // Wednesday 12 Aug 2026 16:00 IST → after close → today close
  const afterClose = new Date("2026-08-12T10:30:00.000Z");
  const closedPick = pickDeskClose(bars, afterClose);
  check("after close uses today", closedPick?.spotKind === "today_close", closedPick?.spotKind);
  check("after close as-of today", closedPick?.priceAsOfDate === "2026-08-12", closedPick?.priceAsOfDate);
  check("after close level is today", closedPick?.close === 24700, String(closedPick?.close));

  // Saturday 15 Aug 2026 12:00 IST — holiday/weekend → last bar
  const weekendBars = [
    { dateYmd: "2026-08-13", close: 24800 },
    { dateYmd: "2026-08-14", close: 24900 },
  ];
  const weekend = new Date("2026-08-15T06:30:00.000Z");
  const holidayPick = pickDeskClose(weekendBars, weekend);
  check(
    "weekend uses last close",
    holidayPick?.spotKind === "last_close" || holidayPick?.spotKind === "prior_close",
    holidayPick?.spotKind,
  );
  check("weekend as-of last trading day", holidayPick?.priceAsOfDate === "2026-08-14", holidayPick?.priceAsOfDate);
  check("weekend level is last trading day", holidayPick?.close === 24900, String(holidayPick?.close));

  // Pre-open on a day Yahoo already printed an incomplete bar
  const preOpen = new Date("2026-08-12T02:00:00.000Z"); // 07:30 IST
  const prePick = pickDeskClose(bars, preOpen);
  check("pre-open uses prior close", prePick?.spotKind === "prior_close", prePick?.spotKind);
  check("pre-open as-of prior day", prePick?.priceAsOfDate === "2026-08-11", prePick?.priceAsOfDate);
}

{
  check(
    "desk today IST stays 18 Aug before UTC midnight",
    deskTodayISO(new Date("2026-08-18T10:30:00.000Z")) === "2026-08-18",
  );
  check(
    "desk today IST rolls to 19 Aug while UTC is still 18 Aug",
    deskTodayISO(new Date("2026-08-18T19:00:00.000Z")) === "2026-08-19",
  );
  const nextIstMorning = new Date("2026-08-18T19:00:00.000Z");
  const overnightBars = [
    { dateYmd: "2026-08-17", close: 24300 },
    { dateYmd: "2026-08-18", close: 24366 },
  ];
  const overnightPick = pickDeskClose(overnightBars, nextIstMorning);
  check("IST next day before open uses last completed close", overnightPick?.close === 24366, String(overnightPick?.close));
  check("IST next day before open is prior/last close", overnightPick?.spotKind === "prior_close", overnightPick?.spotKind);
}

{
  const dates = observationDatesForProduct(product, "2026-08-18");
  check("ongoing observation is nearest remaining expiry", dates[0] === "2027-02-23", String(dates[0]));
  check("1 month observation is second remaining expiry", dates[1] === "2027-05-25", String(dates[1]));
  check("2 month observation is third remaining expiry", dates[2] === "2027-08-31", String(dates[2]));
  check("3 month observation is fourth remaining expiry", dates[3] === "2027-11-30", String(dates[3]));
  check("ongoing tab keeps the product", productHasObservationTab(product, "ongoing", "2026-08-18"));
  check("1 month tab keeps 961 (second remaining date exists)", productHasObservationTab(product, "obs-1m", "2026-08-18"));
  check("2 month tab keeps 961 (third remaining date exists)", productHasObservationTab(product, "obs-2m", "2026-08-18"));
  check("3 month tab keeps 961 (fourth remaining date exists)", productHasObservationTab(product, "obs-3m", "2026-08-18"));
  const uniqueExpiries = new Set(product.legs.map((leg) => leg.expiry.slice(0, 10))).size;
  const kept = productsForObservationTab([product], "ongoing", "2026-08-18")[0];
  check("ongoing tab keeps every option expiry", Boolean(kept) && kept!.legs.length === product.legs.length);
  check(
    "ongoing tab does not collapse unique expiries",
    Boolean(kept) && new Set(kept!.legs.map((leg) => leg.expiry.slice(0, 10))).size === uniqueExpiries,
    String(uniqueExpiries),
  );
  check("3 month tab maps to fourth remaining expiry", expiryForObservationTab(dates, "obs-3m") === "2027-11-30");

  const twoDateBook: ProductMaster = {
    ...product,
    productName: "Two Date Probe",
    legs: [
      { ...product.legs[0], expiry: "2026-09-24T00:00:00.000Z" },
      { ...product.legs[1], expiry: "2027-02-25T00:00:00.000Z" },
    ],
  };
  check("two-date book is ongoing", productHasObservationTab(twoDateBook, "ongoing", "2026-08-18"));
  check("two-date book is on 1 month (second remaining)", productHasObservationTab(twoDateBook, "obs-1m", "2026-08-18"));
  check("two-date book is not on 2 month", !productHasObservationTab(twoDateBook, "obs-2m", "2026-08-18"));
  check("two-date book is not on 3 month", !productHasObservationTab(twoDateBook, "obs-3m", "2026-08-18"));

  const matured: ProductMaster = {
    ...product,
    productName: "Matured Probe",
    maturityDate: "2025-01-15T00:00:00.000Z",
  };
  check("past maturity is not ongoing", !productHasObservationTab(matured, "ongoing", "2026-08-18"));
  check("past maturity is not on 1 month tab", !productHasObservationTab(matured, "obs-1m", "2026-08-18"));
  check("past maturity lands on Expired tab", productHasObservationTab(matured, "expired", "2026-08-18"));
  check("live product is not on Expired tab", !productHasObservationTab(product, "expired", "2026-08-18"));
  check(
    "LIVE observation tabs exclude Expired",
    LIVE_OBSERVATION_TAB_ORDER.length === 4 &&
      LIVE_OBSERVATION_TAB_ORDER.map((tab) => tab.id).join(",") === "ongoing,obs-3m,obs-2m,obs-1m",
  );
  check(
    "Desk Book observation tabs include Expired",
    OBSERVATION_TAB_ORDER.map((tab) => tab.id).includes("expired"),
  );
  const livePool = productsWithLiveMaturity([product, matured], "2026-08-18");
  check("live maturity filter drops matured products", livePool.length === 1 && livePool[0]?.productName === product.productName);
  check(
    "Expired tab lists only matured products",
    productsForObservationTab([product, matured], "expired", "2026-08-18").every(
      (item) => item.productName === "Matured Probe",
    ),
  );
  const asOfMaturity: ProductMaster = {
    ...product,
    maturityDate: "2026-08-18T00:00:00.000Z",
  };
  check("maturity on as-of day stays ongoing", productHasObservationTab(asOfMaturity, "ongoing", "2026-08-18"));
  const allExpiriesPassed: ProductMaster = {
    ...product,
    maturityDate: "2027-12-31T00:00:00.000Z",
    legs: product.legs.map((leg) => ({ ...leg, expiry: "2025-01-01T00:00:00.000Z" })),
  };
  check(
    "live maturity with passed option expiries stays on Ongoing",
    productHasObservationTab(allExpiriesPassed, "ongoing", "2026-08-18"),
  );
  check(
    "live maturity with passed option expiries is not on 1 month",
    !productHasObservationTab(allExpiriesPassed, "obs-1m", "2026-08-18"),
  );

  // Reference anchors are data: the surface's own values, else the live spot passed in.
  const withoutRef = normalizeVolSurface({ ...surface, referenceUnderlyingPrice: undefined, referenceSensexPrice: undefined });
  check(
    "missing nifty reference falls back to the live spot",
    referenceUnderlyingPrice(withoutRef, 22800) === 22800,
    String(referenceUnderlyingPrice(withoutRef, 22800)),
  );
  check(
    "missing sensex reference falls back to the live spot",
    referenceSensexPrice(withoutRef, 73000) === 73000,
    String(referenceSensexPrice(withoutRef, 73000)),
  );
  const ownRefs = normalizeVolSurface({
    ...surface,
    referenceUnderlyingPrice: 24366,
    referenceSensexPrice: 78009.25,
  });
  check(
    "a surface keeps its own nifty reference (no hardcoded override)",
    ownRefs.referenceUnderlyingPrice === 24366,
    String(ownRefs.referenceUnderlyingPrice),
  );
  check(
    "a surface keeps its own sensex reference (no hardcoded override)",
    ownRefs.referenceSensexPrice === 78009.25,
    String(ownRefs.referenceSensexPrice),
  );
  check(
    "monthly anchors are read from the vol seed",
    AUGUST_REFERENCE_UNDERLYING_PRICE === volSeed.referenceUnderlyingPrice &&
      AUGUST_REFERENCE_SENSEX_PRICE === volSeed.referenceSensexPrice &&
      DEFAULT_FWD_SELL_RATE === volSeed.pricingParams[0]!.fwdSellRate,
  );
  const expiryDayBook: ProductMaster = {
    ...product,
    legs: product.legs.map((leg, i) => ({ ...leg, expiry: i === 0 ? "2026-10-22T00:00:00.000Z" : leg.expiry })),
  };
  check(
    "an option expiring on the as-of day is not a remaining observation",
    !remainingObservationDays(expiryDayBook, "2026-10-22").includes("2026-10-22"),
  );
  check(
    "an option expiring on the as-of day settles as expired",
    collectExpiredLegExpiryDates(expiryDayBook, "2026-10-22").includes("2026-10-22"),
  );
  const niftyStrikes = moneynessStrikes(surface, 22800, "Nifty");
  const sensexStrikes = moneynessStrikes(surface, 80000, "Sensex");
  check(
    "nifty 100% strike is 1 Oct 2026 Nifty close",
    Math.abs((niftyStrikes[10] ?? 0) - AUGUST_REFERENCE_UNDERLYING_PRICE) < 1e-9,
    String(niftyStrikes[10]),
  );
  check(
    "sensex 100% strike is 1 Oct 2026 Sensex close",
    Math.abs((sensexStrikes[10] ?? 0) - AUGUST_REFERENCE_SENSEX_PRICE) < 1e-9,
    String(sensexStrikes[10]),
  );
  check(
    "nifty strike grid shows paise (not integer-rounded 100% anchor)",
    formatNumber(AUGUST_REFERENCE_UNDERLYING_PRICE, INDEX_STRIKE_PRICE_DECIMALS) === "22,421.95",
    formatNumber(AUGUST_REFERENCE_UNDERLYING_PRICE, 0),
  );
  check(
    "sensex strike grid shows paise at 100% anchor",
    formatNumber(AUGUST_REFERENCE_SENSEX_PRICE, INDEX_STRIKE_PRICE_DECIMALS) === "71,909.70",
  );
  const expiry = parseISODate("2027-02-25");
  const niftyVol = interpolateVolPercent(surface, AUGUST_REFERENCE_UNDERLYING_PRICE, expiry, 22800, "Nifty");
  const sensexVol = interpolateVolPercent(surface, AUGUST_REFERENCE_SENSEX_PRICE, expiry, 80000, "Sensex");
  check("sensex 100% vol matches nifty 100% vol", Math.abs(niftyVol - sensexVol) < 1e-9, `${niftyVol} vs ${sensexVol}`);
}

{
  const observationDay = parseISODate("2026-08-18");
  const callOnDay = priceLeg({
    leg: {
      optionType: "Call",
      strike: 23408,
      spreads: 1,
      originalSide: "Sell",
      expiry: "2026-08-18",
    },
    spot: 24366,
    valuationDate: observationDay,
    surface,
  });
  check("passed observation call price is 0", callOnDay.price === 0, String(callOnDay.price));
  const sensexCall = priceLeg({
    leg: {
      optionType: "Call",
      strike: 78009.25,
      spreads: 1,
      originalSide: "Buy",
      expiry: "2026-08-01",
    },
    spot: 80000,
    valuationDate: parseISODate("2026-08-18"),
    surface,
    underlying: "Sensex",
  });
  check("expired Sensex call price is 0", sensexCall.price === 0, String(sensexCall.price));
  const otmPut = priceLeg({
    leg: {
      optionType: "Put",
      strike: 20000,
      spreads: 1,
      originalSide: "Sell",
      expiry: "2026-08-01",
    },
    spot: 24366,
    valuationDate: parseISODate("2026-08-18"),
    surface,
  });
  check("expired OTM put pricer floors at zero", otmPut.price === 0, String(otmPut.price));
  const deepOtmLive = priceLeg({
    leg: {
      optionType: "Put",
      strike: 12810,
      spreads: 1,
      originalSide: "Buy",
      expiry: "2026-09-24",
    },
    spot: 23446.6,
    valuationDate: parseISODate("2026-09-10"),
    surface,
  });
  check(
    "live deep OTM put price is two decimal places",
    deepOtmLive.price === Math.round(deepOtmLive.price * 100) / 100 &&
      deepOtmLive.sellPrice === Math.round(deepOtmLive.sellPrice * 100) / 100 &&
      deepOtmLive.buyPrice === Math.round(deepOtmLive.buyPrice * 100) / 100,
    `px=${deepOtmLive.price}`,
  );
  check(
    "live deep OTM noise rounds to 0.00 not float dust",
    deepOtmLive.price === 0,
    String(deepOtmLive.price),
  );
  const expiredCallLeg = {
    optionType: "Call",
    strike: 24000,
    spreads: 1,
    originalSide: "Buy",
    expiry: "2026-08-01",
    reqQuantity: 1500,
  };
  const expiredCallRow = computeUnwind({
    product: { ...product, legs: [expiredCallLeg] },
    surface,
    inputs: { debentures: 800, unwindDate: "2026-08-18", spot: 24366 },
  }).optionRows[0];
  check(
    "expired ITM buy call inflow is positive",
    expiredCallRow != null && expiredCallRow.unwindPrice === 366 && expiredCallRow.premiumOutflowRs > 0,
    `${expiredCallRow?.unwindPrice} / ${expiredCallRow?.premiumOutflowRs}`,
  );
}

{
  const p1684 = (multiSeed as ProductMaster[]).find((p) => p.productName.includes("1684"));
  check("1684 deduped to 42 legs", (p1684?.legs.length ?? 0) === 42, String(p1684?.legs.length));
  check(
    "no seed product keeps an exact cloned option row",
    (multiSeed as ProductMaster[]).every((p) => {
      const keys = p.legs.map(optionLegCloneKey);
      return new Set(keys).size === keys.length;
    }),
  );
  const doubled = dedupeOptionLegs([...(p1684?.legs ?? []), ...(p1684?.legs ?? [])]);
  check("dedupe helper halves pasted 1684 book", doubled.length === 42, String(doubled.length));
  if (p1684) {
    const clean = computeUnwind({
      product: p1684,
      surface: septemberSurface,
      inputs: { debentures: 1, unwindDate: "2026-08-17", spot: 24366 },
    });
    const pastedTwice = computeUnwind({
      product: { ...p1684, legs: [...p1684.legs, ...p1684.legs] },
      surface: septemberSurface,
      inputs: { debentures: 1, unwindDate: "2026-08-17", spot: 24366 },
    });
    check(
      "1684 deduped quote is lower than pricing the pasted block twice",
      clean.unwindQuoteRs <= pastedTwice.unwindQuoteRs + 1e-6,
      `${clean.unwindQuoteRs} vs ${pastedTwice.unwindQuoteRs}`,
    );
    check(
      "1684 deduped quote lands near Excel Main Master (not the doubled paste)",
      Math.abs(clean.unwindQuoteRs - 101739.47) < 2500,
      String(clean.unwindQuoteRs),
    );
  }
}

{
  const accel706 = (multiSeed as ProductMaster[]).find((item) => item.productName.trim() === "Nifty Accelerator - 706");
  const accelDates = [...new Set((accel706?.legs ?? []).map((leg) => leg.expiry.slice(0, 10)))].sort();
  check(
    "Nifty Accelerator 706 expiries are New Primary observations",
    accelDates.join(",") === "2026-03-30,2026-06-30,2026-09-29",
    accelDates.join(","),
  );
  check(
    "any observation keeps 706 when Sep 2026 is inside the window",
    accel706 != null && productMatchesObservationRange(accel706, "any", "2026-09-01", "2026-09-30"),
  );
  check(
    "any observation drops 706 when the window is only 2021",
    accel706 != null && !productMatchesObservationRange(accel706, "any", "2021-08-18", "2021-12-31"),
  );
  const matrix = buildProductBookMatrix({
    serial: 1,
    product,
    asOf: "2026-10-03",
    quote: null,
  });
  check("Product Book matrix width matches headers", matrix.rows.every((row) => row.length === PRODUCT_BOOK_HEADERS.length));
  check(
    "Premium Outflow column follows Client Internal Rate of Return",
    PRODUCT_BOOK_HEADERS[7] === "Premium Outflow",
  );
  check(
    "Options Book columns close the Product Book",
    PRODUCT_BOOK_HEADERS.slice(-OPTION_BOOK_HEADERS.length).join("|") === OPTION_BOOK_HEADERS.join("|"),
  );
  const live = productsWithLiveMaturity(multiSeed as ProductMaster[], "2026-10-03");
  const oldestObs = oldestObservationYmd(live, "2026-10-03");
  check("observation start is an option expiry", /^\d{4}-\d{2}-\d{2}$/.test(oldestObs) && oldestObs < "2026-10-03", oldestObs);
  check(
    "missing current-month surface keeps the previous month",
    pickCarriedVolSurface(
      [
        { monthKey: "2026-09", expiries: ["2026-10-28"], label: "September" },
        { monthKey: "2026-08", expiries: ["2026-08-26"], label: "August" },
      ],
      "2026-10",
    )?.monthKey === "2026-09",
  );
  const carried = labelSurfaceForDeskMonth(septemberSurface, "2026-10", { nifty: 25100.5, sensex: 81234.25 });
  check("carried surface is named for the current month", carried.label === "October 2026 Volatility Surface", carried.label);
  check(
    "carried surface keeps the previous vol grid under the current month",
    carried.monthKey === "2026-10" && carried.expiries.length === septemberSurface.expiries.length,
  );
  check("carried reference prices are the current month anchors", carried.referenceUnderlyingPrice === 25100.5 && carried.referenceSensexPrice === 81234.25);
  for (const future of [
    ["2026-11", "November 2026 Volatility Surface"],
    ["2026-12", "December 2026 Volatility Surface"],
    ["2027-01", "January 2027 Volatility Surface"],
    ["2027-06", "June 2027 Volatility Surface"],
  ] as const) {
    const rolled = labelSurfaceForDeskMonth(surface, future[0], { nifty: 23000.25, sensex: 74000.5 });
    check(`${future[0]} carry names that month`, rolled.label === future[1] && rolled.monthKey === future[0], rolled.label);
    check(
      `${future[0]} carry keeps the seed grid and uses that month's anchors`,
      rolled.expiries.length === surface.expiries.length &&
        rolled.referenceUnderlyingPrice === 23000.25 &&
        rolled.referenceSensexPrice === 74000.5,
    );
  }
  const alreadyCurrent = labelSurfaceForDeskMonth(
    { ...surface, monthKey: "2027-03", label: "March 2027 Volatility Surface" },
    "2027-03",
    { nifty: 1, sensex: 1 },
  );
  check(
    "a surface already on the current month is left as uploaded",
    alreadyCurrent.monthKey === "2027-03" && alreadyCurrent.referenceUnderlyingPrice === surface.referenceUnderlyingPrice,
  );
  check(
    "current-month surface wins over the previous month",
    pickCarriedVolSurface(
      [
        { monthKey: "2026-09", expiries: ["2026-10-28"] },
        { monthKey: "2026-10", expiries: ["2026-10-28"] },
      ],
      "2026-10",
    )?.monthKey === "2026-10",
  );
  const spans = computeGroupedRowSpans(matrix.rows, [...PRODUCT_BOOK_MERGE_COLS], 0);
  check(
    "shared Product Name clubs across legs",
    (spans[0]?.[1] ?? 0) === matrix.rows.length,
    String(spans[0]?.[1]),
  );
  const clubbed = clubProductBookDisplay(matrix.rows, 0);
  check("screen keeps every column on every row", clubbed.every((row) => row.length === matrix.rows[0]?.length));
  check("screen shows the product name once", clubbed[0]?.[1] === matrix.rows[0]?.[1] && clubbed[1]?.[1] === "");
  check("screen still shows a changed option expiry", clubbed[1]?.[PRODUCT_BOOK_HEADERS.indexOf("Option Expiry Date")] !== "");
  const copied = clubProductBookDisplay([matrix.rows[0]!, [...matrix.rows[0]!]], 0);
  check("screen blanks a value that repeats on the next row", copied[1]?.every((cell) => cell === "") === true);
  check(
    "Unwind Option Price stays one cell per leg",
    spans.every((row) => row[PRODUCT_BOOK_HEADERS.indexOf("Unwind Option Price")] === 1),
  );
}

const passedBook = {
  ...product,
  faceValue: 100000,
  coupon: 0.1,
  mobilization: 1_000_000,
  legs: product.legs.map((leg) => ({ ...leg, expiry: "2020-01-01" })),
};
check("post observation keeps a book whose every expiry has passed", allOptionExpiriesPassed(passedBook, "2026-10-10"));
check("post observation drops a book that still has a live expiry", !allOptionExpiriesPassed(product, deskTodayISO()));
const postFigures = postObservationFigures(passedBook, {
  quoteRs: 105000,
  productIRR: 0,
  clientIRR: 0,
  residualIRR: 0,
  premiumOutflowRs: -10,
  asOf: "2026-10-10",
  economics: {
    amtWithNbfcRs: 1,
    grownValueRs: 2,
    premiumCreditedRs: 3,
    premGrownValueRs: 4,
    premiumOutflowRs: -10,
    unwindValueRs: 900000,
    bookUnwindPerDebentureRs: 5,
  },
  funding: {
    totalDebs: 10,
    amountWithNbfc: 0.9,
    nbfcGrownValue: 1,
    premiumCreditedPct: 0.2,
    premiumGrownValue: 0.22,
    currentPremOutflowPct: -0.01,
  },
  legs: [],
});
check("expected maturity quote is face times one plus coupon", postFigures.expectedQuote === 110000, String(postFigures.expectedQuote));
check("expected amount is the maturity quote times the debenture count", postFigures.expectedAmount === 1100000, String(postFigures.expectedAmount));
check("unwind amount is the product book quote times the debentures", postFigures.unwindQuote === 105000 && postFigures.unwindAmount === 1050000, String(postFigures.unwindAmount));
check("difference is unwind amount minus expected amount", postFigures.difference === -50000, String(postFigures.difference));
const couponCell = postObservationDisplayRow(1, passedBook, null)[POST_OBSERVATION_HEADERS.indexOf("Contingent Coupon")];
check("contingent coupon is shown as a percent", couponCell === "10.00%", couponCell);
const fractionalBooks = (multiSeed as ProductMaster[]).filter((item) => {
  const count = item.faceValue > 0 ? item.mobilization / item.faceValue : 0;
  return Math.abs(count - Math.round(count)) > 1e-4;
});
let fractionalBreaks = 0;
for (const item of fractionalBooks) {
  const shown = postObservationDisplayRow(1, item, null)[POST_OBSERVATION_HEADERS.indexOf("Total Debentures in Issue")];
  const count = Number(String(shown).replace(/,/g, ""));
  const figures = postObservationFigures(item, null);
  if (roundDeskMoney(figures.expectedQuote * count) !== figures.expectedAmount) fractionalBreaks += 1;
}
check(
  "fractional debenture counts multiply back to expected amount",
  fractionalBooks.length > 0 && fractionalBreaks === 0,
  `${fractionalBreaks} of ${fractionalBooks.length}`,
);
check(
  "amount with NBFC subtracts costs and margin funds",
  amountWithNbfcRupees(product) === computeUnwind({
    product,
    surface,
    inputs: { debentures: 800, unwindDate: "2025-02-21", spot: 22800 },
  }).masterEconomics.amtWithNbfcRs,
);
const oneExpiry = {
  ...passedBook,
  legs: [{ ...(passedBook.legs.find((leg) => leg.reqQuantity) ?? passedBook.legs[0]!), expiry: "2020-01-01" }],
};
const windowSum = premiumOutflowInWindow(
  [oneExpiry],
  () => ({
    quoteRs: 1,
    productIRR: 0,
    clientIRR: 0,
    residualIRR: 0,
    premiumOutflowRs: -50,
    asOf: "2026-10-10",
    economics: null,
    funding: null,
    legs: [
      {
        optionType: "Put",
        strike: 1,
        spreads: 1,
        original: "Sell",
        unwindSide: "Buy",
        quantity: -1,
        premiumPerSpread: null,
        productPremiumAmount: 0,
        unwindOptionPrice: 50,
        premiumOutflowAmount: -50,
        displayOnly: false,
      },
    ],
  }),
  "2020-01-01",
  "2020-01-01",
);
check("premium outflow card sums legs inside the observation window", windowSum.total === -50 && windowSum.legs === 1, String(windowSum.total));

console.log(failures ? `\n${failures} edge case checks FAILED` : "\nEdge case checks PASSED");
if (failures) process.exit(1);
