import { NextResponse } from "next/server";

import { activeManagementQuote, type ActiveManagementQuote } from "@/lib/active-management/book-row";
import { productBookInputs } from "@/lib/active-management/book-scenario";
import { expectedIrrAtLevel } from "@/lib/active-management/scenario";
import { actualTargetFor } from "@/lib/active-management/target-seed";
import { loadMultiDesk } from "@/lib/data/multi-load";
import {
  computeUnwindWithExpirySpots,
  type UnwindWithSpotsResult,
} from "@/lib/engine/compute-unwind-with-spots";
import { resolveDeskSpots } from "@/lib/engine/desk-spots";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster, UnwindInputs, VolSurface } from "@/lib/types";
import { deskTodayISO } from "@/lib/utils";
import { quoteViewFromUnwind, type ProductBookQuoteView } from "@/lib/workbook/product-book-rows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Batched Product Book quotes — keep under Vercel hobby/pro limits per request. */
export const maxDuration = 120;

function todayISO(): string {
  return deskTodayISO();
}

/** Expected IRR index levels. Null means the desk spot. */
type AssumedLevels = { nifty: number | null; sensex: number | null };

function assumedLevel(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Active Management fields off the unwind just priced: the same expiry closes for the
 * observation fixings, and one more full unwind at the assumed level for Expected IRR.
 * A failure here leaves am null and never blanks the quote beside it.
 */
function activeManagementFor(
  key: string,
  product: ProductMaster,
  surface: VolSurface,
  inputs: UnwindInputs,
  result: UnwindWithSpotsResult,
  assumed: AssumedLevels,
): ActiveManagementQuote | null {
  try {
    const fixings = result.expirySpotsUsed ?? {};
    const level = inputs.underlying === "Sensex" ? assumed.sensex : assumed.nifty;
    const expected =
      level == null
        ? null
        : expectedIrrAtLevel({ product, surface, inputs: { ...inputs, expirySpots: fixings }, level });
    return activeManagementQuote({
      product,
      asOf: inputs.unwindDate,
      result,
      surface,
      fixings,
      target: actualTargetFor(product),
      expected,
    });
  } catch (err) {
    console.error("[multi quotes] active management", key, err);
    return null;
  }
}

async function quoteProducts(
  products: ProductMaster[],
  surface: VolSurface,
  nifty: number,
  sensex: number,
  unwindDate: string,
  assumed: AssumedLevels,
) {
  const quotes: Record<
    string,
    ProductBookQuoteView & { quotePct: number | null; am: ActiveManagementQuote | null }
  > = {};
  for (const product of products) {
    const key = productKey(product);
    try {
      // Issued debentures, desk spots, and each leg's Bid Ask table spread (no flat spread).
      const inputs: UnwindInputs = productBookInputs(product, { unwindDate, nifty, sensex });
      const result = await computeUnwindWithExpirySpots({
        product,
        surface,
        yahooDeskSpots: false,
        inputs,
      });
      const view = quoteViewFromUnwind(result, unwindDate);
      quotes[key] = {
        ...view,
        quotePct: result.unwindQuotePct,
        am: activeManagementFor(key, product, surface, inputs, result, assumed),
      };
    } catch (err) {
      console.error("[multi quotes]", key, err);
      quotes[key] = {
        quoteRs: null,
        quotePct: null,
        productIRR: null,
        clientIRR: null,
        residualIRR: null,
        premiumOutflowRs: null,
        asOf: unwindDate,
        economics: null,
        funding: null,
        legs: [],
        am: null,
      };
    }
  }
  return quotes;
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST /api/multi/quotes with a keys array (max 64). Full-book GET pricing is disabled.",
    },
    { status: 405, headers: { "Cache-Control": "no-store, max-age=0", Allow: "POST" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    keys?: string[];
    /** Optional client book slice — prices uploads before / without Mongo sync. */
    products?: ProductMaster[];
    /** Optional Expected IRR levels; anything but a finite positive number means the desk spot. */
    assumed?: { nifty?: number | null; sensex?: number | null };
  } | null;
  const keys = [...new Set((body?.keys ?? []).filter((key) => typeof key === "string" && key.length > 0))];
  if (!keys.length) {
    return NextResponse.json(
      { error: "Provide a non-empty keys array (max 64 per request)." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  if (keys.length > 64) {
    return NextResponse.json(
      { error: "Too many keys — send at most 64 per request." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  const keySet = new Set(keys);
  const clientProducts = Array.isArray(body?.products)
    ? body!.products!.filter((p): p is ProductMaster => Boolean(p && typeof p === "object"))
    : [];
  const assumed: AssumedLevels = {
    nifty: assumedLevel(body?.assumed?.nifty),
    sensex: assumedLevel(body?.assumed?.sensex),
  };
  const unwindDate = todayISO();
  let loaded: [Awaited<ReturnType<typeof loadMultiDesk>>, Awaited<ReturnType<typeof resolveDeskSpots>>];
  try {
    loaded = await Promise.all([loadMultiDesk(), resolveDeskSpots(unwindDate)]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk spots unavailable";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  const [{ products, surface }, desk] = loaded;

  let slice: ProductMaster[];
  if (clientProducts.length) {
    const byKey = new Map(clientProducts.map((product) => [productKey(product), product]));
    slice = keys.map((key) => byKey.get(key)).filter((p): p is ProductMaster => Boolean(p));
  } else {
    slice = products.filter((product) => keySet.has(productKey(product)));
  }

  return NextResponse.json(
    {
      quotes: await quoteProducts(slice, surface, desk.nifty, desk.sensex, unwindDate, assumed),
      unwindDate,
      nifty: desk.nifty,
      sensex: desk.sensex,
      spotSource: desk.source,
      priceAsOfDate: desk.priceAsOfDate,
      priced: slice.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
