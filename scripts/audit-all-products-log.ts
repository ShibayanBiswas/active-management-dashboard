/**
 * Per-product Options Book + economics log for every unique multi-book product.
 * Writes card values (Quotes / Facts / NBFC MIS / Book Values) and every Options Book row.
 * Outputs:
 *   logs/all-products-run-<asOf>-summary.json
 *   logs/all-products-cards-<asOf>.json
 *   logs/all-products-run-<asOf>-results.json
 */
import fs from "node:fs";
import path from "node:path";

import multiSeed from "../lib/data/multi-products-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import { computeUnwindWithExpirySpots } from "../lib/engine/compute-unwind-with-spots";
import { pricingSpotFromDesk, resolveDeskSpots } from "../lib/engine/desk-spots";
import { legExpiryYmd, spotForExpiredSellPut } from "../lib/engine/expiry-spots";
import { priceProductBook, unwindMarkPrice } from "../lib/engine/pricer";
import { normalizeVolSurface } from "../lib/engine/vol-surface";
import { expiredIntrinsicMark } from "../lib/engine/unwind";
import { issuedCount, productKey, uniqueProductsByIsin } from "../lib/multi/product-key";
import { productsWithLiveMaturity } from "../lib/observation-tabs";
import type { ProductMaster, VolSurface } from "../lib/types";
import { deskTodayISO, underlyingFromProductName } from "../lib/utils";

const asOf = deskTodayISO();
const surface = normalizeVolSurface(volSeed as VolSurface);
const ongoing = productsWithLiveMaturity(uniqueProductsByIsin(multiSeed as ProductMaster[]), asOf);
const outDir = path.join(process.cwd(), "logs");
fs.mkdirSync(outDir, { recursive: true });

const bugs: string[] = [];
const products: unknown[] = [];
const tally = {
  legs: 0,
  expiredPuts: 0,
  expiredCalls: 0,
  itmPutOriginalSellUnwindBuy: 0,
  itmPutOriginalBuyUnwindSell: 0,
  otmPuts: 0,
  sideNotOpposite: 0,
  sameStrikePriceMismatch: 0,
};

async function main() {
  const desk = await resolveDeskSpots(asOf);
  const spotNifty = desk.nifty;
  const spotSensex = desk.sensex;
  console.log(
    JSON.stringify(
      { asOf, spotNifty, spotSensex, source: desk.source, priceAsOfDate: desk.priceAsOfDate },
      null,
      2,
    ),
  );

  for (const product of ongoing) {
    const underlying = underlyingFromProductName(product.productName, product.productCode);
    const spot = pricingSpotFromDesk(underlying, desk);
    const result = await computeUnwindWithExpirySpots({
      product,
      surface,
      yahooDeskSpots: false,
      inputs: {
        debentures: Math.max(issuedCount(product), 1),
        unwindDate: asOf,
        spot,
        nifty: spotNifty,
        sensex: spotSensex,
        underlying,
      },
    });
    const expirySpots = result.expirySpotsUsed ?? {};
    const priced = priceProductBook({
      product,
      spot,
      valuationDate: asOf,
      surface,
      underlying,
    });

    const legs = result.optionRows.map((row, i) => {
      const pr = priced[i]!;
      const isCall = row.options.toLowerCase().startsWith("c");
      const original = row.original.trim().toLowerCase();
      const unwind = row.unwind.trim().toLowerCase();
      const buy = original === "buy";
      tally.legs += 1;
      const opposite =
        (original === "buy" && unwind === "sell") || (original === "sell" && unwind === "buy");
      if (!opposite) {
        tally.sideNotOpposite += 1;
        bugs.push(`${product.productCode} unwind is not the opposite ${row.strike}@${row.expiry.slice(0, 10)}`);
      }
      if (original === "sell" && row.quantity > 0) {
        bugs.push(`${product.productCode} sell qty positive ${row.strike}`);
      }
      if (original === "buy" && row.quantity < 0) {
        bugs.push(`${product.productCode} buy qty negative ${row.strike}`);
      }
      const settlementSpot = row.expired
        ? spotForExpiredSellPut(legExpiryYmd(row.expiry), spot, expirySpots)
        : spot;
      const intrinsic = row.expired ? expiredIntrinsicMark(settlementSpot, row.strike, isCall) : null;
      const countedInKpi = !row.expired || (intrinsic != null && intrinsic > 0);
      if (row.expired && row.unwindPrice !== intrinsic) {
        bugs.push(`${product.productCode} intrinsic ${row.strike}@${row.expiry.slice(0, 10)}`);
      }
      if (row.expired && intrinsic != null) {
        const wantCash = Math.round(intrinsic * row.quantity * 100) / 100;
        if (Math.abs(row.premiumOutflowRs - wantCash) > 0.02) {
          bugs.push(`${product.productCode} cash ${row.strike}@${row.expiry.slice(0, 10)}`);
        }
      }
      if (row.expired && buy && intrinsic != null && intrinsic > 0 && row.premiumOutflowRs <= 0) {
        bugs.push(`${product.productCode} buy ITM inflow ${row.strike}@${row.expiry.slice(0, 10)}`);
      }
      if (row.expired && !buy && intrinsic != null && intrinsic > 0 && row.premiumOutflowRs >= 0) {
        bugs.push(`${product.productCode} sell ITM outflow ${row.strike}@${row.expiry.slice(0, 10)}`);
      }
      if (row.expired && !isCall) {
        tally.expiredPuts += 1;
        const putItm = expiredIntrinsicMark(settlementSpot, row.strike, false);
        if (row.unwindPrice !== putItm) {
          bugs.push(`${product.productCode} put price ${row.strike}@${row.expiry.slice(0, 10)}`);
        }
        if (putItm === 0) tally.otmPuts += 1;
        if (putItm > 0 && original === "sell" && unwind === "buy") {
          tally.itmPutOriginalSellUnwindBuy += 1;
          if (row.premiumOutflowRs >= 0) {
            bugs.push(`${product.productCode} unwind buy not an outflow ${row.strike}`);
          }
        }
        if (putItm > 0 && original === "buy" && unwind === "sell") {
          tally.itmPutOriginalBuyUnwindSell += 1;
          if (row.premiumOutflowRs <= 0) {
            bugs.push(`${product.productCode} unwind sell not an inflow ${row.strike}`);
          }
        }
      }
      if (row.expired && isCall) tally.expiredCalls += 1;
      if (!row.expired) {
        const mark = unwindMarkPrice(pr, row.original);
        if (Math.abs(Math.abs(row.unwindPrice) - Math.abs(mark)) > 0.02) {
          bugs.push(`${product.productCode} live mark ${row.strike}`);
        }
      }
      if (pr.expired && (pr.price !== 0 || pr.sellPrice !== 0 || pr.buyPrice !== 0)) {
        bugs.push(`${product.productCode} pricer expired nonzero ${row.strike}`);
      }
      return {
        options: row.options,
        strike: row.strike,
        spreads: row.spreads,
        original: row.original,
        unwind: row.unwind,
        quantity: row.quantity,
        expiry: row.expiry.slice(0, 10),
        expired: row.expired,
        countedInKpi,
        settlementSpot: row.expired ? settlementSpot : null,
        premiumPerSpread: row.premiumPerSpread,
        prdPremium: row.prdPremium,
        unwindPrice: row.unwindPrice,
        premiumOutflowRs: row.premiumOutflowRs,
        pricerPrice: pr.price,
        pricerSell: pr.sellPrice,
        pricerBuy: pr.buyPrice,
        pricerFwd: pr.forwardGrowth,
        pricerDisc: pr.discountYield,
        pricerVol: pr.volatility,
        intrinsic,
      };
    });

    const putGroups = new Map<string, number[]>();
    for (const leg of legs) {
      if (!leg.expired || String(leg.options).toLowerCase().startsWith("c")) continue;
      const key = `${leg.expiry}|${leg.strike}|${leg.settlementSpot}`;
      const prices = putGroups.get(key) ?? [];
      prices.push(leg.unwindPrice);
      putGroups.set(key, prices);
    }
    for (const prices of putGroups.values()) {
      if (prices.some((price) => price !== prices[0])) {
        tally.sameStrikePriceMismatch += 1;
        bugs.push(`${product.productCode} same expiry put price differs by side`);
      }
    }

    const me = result.masterEconomics;
    const legCashSum = result.optionRows.reduce((sum, row) => sum + row.premiumOutflowRs, 0);
    if (Math.abs(me.premiumOutflowRs - legCashSum) > 0.02) {
      bugs.push(`${product.productCode} net outflow is not the leg sum`);
    }
    if (
      Math.abs(me.unwindValueRs - (me.grownValueRs + me.premGrownValueRs + me.premiumOutflowRs)) >
      0.02
    ) {
      bugs.push(`${product.productCode} unwind identity`);
    }

    products.push({
      key: productKey(product),
      code: product.productCode,
      name: product.productName,
      underlying,
      spot,
      expirySpots,
      cards: {
        quotes: {
          unwindQuotePct: result.unwindQuotePct,
          unwindQuoteRs: result.unwindQuoteRs,
          productIRR: result.productIRR,
          clientIRR: result.clientIRR,
          residualIRR: result.residualIRR,
        },
        funding: {
          totalDebs: result.totalDebs,
          amountWithNbfc: result.amountWithNbfc,
          nbfcGrownValue: result.nbfcGrownValue,
          premium: result.premium,
          premiumGrownValue: result.premiumGrownValue,
          currentPremOutflowPct: result.currentPremOutflowPct,
        },
        rupees: {
          amtWithNbfcRs: me.amtWithNbfcRs,
          grownValueRs: me.grownValueRs,
          premiumCreditedRs: me.premiumCreditedRs,
          premGrownValueRs: me.premGrownValueRs,
          premiumOutflowRs: me.premiumOutflowRs,
          unwindValueRs: me.unwindValueRs,
          bookUnwindPerDebentureRs: me.unwindQuoteRs,
        },
        facts: {
          investedTenorDays: result.investedTenorDays,
          residualTenor: result.residualTenor,
          tenorDays: result.tenorDays,
          faceValue: result.faceValue,
          mobilization: product.mobilization,
        },
      },
      optionsBook: {
        legCount: legs.length,
        liveLegs: legs.filter((l) => !l.expired).length,
        expiredLegs: legs.filter((l) => l.expired).length,
        expiredSellPuts: legs.filter(
          (l) =>
            l.expired &&
            String(l.options).toLowerCase().startsWith("p") &&
            String(l.original).toLowerCase() === "sell",
        ).length,
        legs,
      },
    });
  }

  const cards = (products as Array<{
    code: string;
    name: string;
    underlying: string;
    spot: number;
    cards: {
      quotes: Record<string, number>;
      funding: Record<string, number>;
      rupees: Record<string, number>;
      facts: Record<string, number>;
    };
    optionsBook: {
      legCount: number;
      liveLegs: number;
      expiredLegs: number;
      expiredSellPuts: number;
      legs: Array<{ countedInKpi: boolean; premiumOutflowRs: number }>;
    };
  }>).map((p) => ({
    code: p.code,
    name: p.name,
    underlying: p.underlying,
    spot: p.spot,
    ...p.cards.quotes,
    ...p.cards.funding,
    ...p.cards.rupees,
    ...p.cards.facts,
    legCount: p.optionsBook.legCount,
    liveLegs: p.optionsBook.liveLegs,
    expiredLegs: p.optionsBook.expiredLegs,
    expiredSellPuts: p.optionsBook.expiredSellPuts,
    countedOutflowLegs: p.optionsBook.legs.filter((l) => l.countedInKpi && l.premiumOutflowRs !== 0)
      .length,
  }));

  const summary = {
    asOf,
    spotNifty,
    spotSensex,
    spotSource: desk.source,
    priceAsOfDate: desk.priceAsOfDate,
    ongoing: ongoing.length,
    tally,
    bugCount: bugs.length,
    bugs: bugs.slice(0, 100),
    clean: bugs.length === 0,
    logFiles: [
      `logs/all-products-run-${asOf}-summary.json`,
      `logs/all-products-cards-${asOf}.json`,
      `logs/all-products-run-${asOf}-results.json`,
    ],
  };
  fs.writeFileSync(path.join(outDir, `all-products-run-${asOf}-summary.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(outDir, `all-products-cards-${asOf}.json`),
    JSON.stringify({ ...summary, products: cards }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, `all-products-run-${asOf}-results.json`),
    JSON.stringify({ summary, products }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.clean) process.exit(1);
  console.log("ALL_PRODUCTS_LOG_CLEAN");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
