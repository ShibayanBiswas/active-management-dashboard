import { NextResponse } from "next/server";

import { loadMultiDesk } from "@/lib/data/multi-load";
import { computeUnwindWithExpirySpots } from "@/lib/engine/compute-unwind-with-spots";
import { resolveDeskSpots } from "@/lib/engine/desk-spots";
import { issuedCount, productKey } from "@/lib/multi/product-key";
import type { ProductMaster, VolSurface } from "@/lib/types";
import { deskTodayISO, underlyingFromProductName } from "@/lib/utils";
import { quoteViewFromUnwind, type ProductBookQuoteView } from "@/lib/workbook/product-book-rows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Batched Product Book quotes — keep under Vercel hobby/pro limits per request. */
export const maxDuration = 120;

function todayISO(): string {
  return deskTodayISO();
}

async function quoteProducts(
  products: ProductMaster[],
  surface: VolSurface,
  nifty: number,
  sensex: number,
  unwindDate: string,
) {
  const quotes: Record<string, ProductBookQuoteView & { quotePct: number | null }> = {};
  for (const product of products) {
    const key = productKey(product);
    const underlying = underlyingFromProductName(product.productName, product.productCode);
    const spot = underlying === "Sensex" ? sensex : nifty;
    try {
      const result = await computeUnwindWithExpirySpots({
        product,
        surface,
        yahooDeskSpots: false,
        inputs: {
          debentures: issuedCount(product),
          unwindDate,
          spot,
          underlying,
          nifty,
          sensex,
          bidAskSpread: 0,
        },
      });
      const view = quoteViewFromUnwind(result, unwindDate);
      quotes[key] = {
        ...view,
        quotePct: result.unwindQuotePct,
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
      quotes: await quoteProducts(slice, surface, desk.nifty, desk.sensex, unwindDate),
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
