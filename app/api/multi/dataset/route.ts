import { NextResponse } from "next/server";

import { loadMultiDesk } from "@/lib/data/multi-load";
import { uniqueProductsByIsin } from "@/lib/multi/product-key";
import { productsWithLiveMaturity } from "@/lib/observation-tabs";
import { deskTodayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Large multi book (~19 MB JSON); allow cold Atlas / seed path to finish. */
export const maxDuration = 60;

/**
 * GET /api/multi/dataset
 * - default / ?scope=live — live-maturity products only (Product Book / Unwinding / Pricer)
 * - ?scope=full — entire unique-ISIN book including expired (Desk Book Expired tab)
 */
export async function GET(req: Request) {
  const desk = await loadMultiDesk();
  const products = uniqueProductsByIsin(desk.products);
  const asOf = deskTodayISO();
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "full" ? "full" : "live";
  const live = uniqueProductsByIsin(productsWithLiveMaturity(products, asOf));
  const payloadProducts = scope === "full" ? products : live;
  return NextResponse.json(
    {
      products: payloadProducts,
      surface: desk.surface,
      bookProductCount: products.length,
      liveProductCount: live.length,
      asOf,
      scope,
    },
    {
      // Vol surface uploads must land immediately — never serve a cached desk book.
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
