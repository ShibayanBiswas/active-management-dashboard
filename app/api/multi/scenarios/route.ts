import { NextResponse } from "next/server";

import { BOOK_SCENARIO_SHIFTS, bookScenarioRows, type BookScenarioRow } from "@/lib/active-management/book-scenario";
import { loadMultiDesk } from "@/lib/data/multi-load";
import { resolveDeskSpots } from "@/lib/engine/desk-spots";
import { resolveExpirySpots } from "@/lib/engine/expiry-spots";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import { deskTodayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 16 products × 21 full unwinds per request. */
export const maxDuration = 120;

const MAX_KEYS = 16;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  return NextResponse.json(
    { error: `Use POST /api/multi/scenarios with a keys array (max ${MAX_KEYS}).` },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}

/**
 * Book scenario table: for each product, 21 full unwinds from −1,000 to +1,000 around today's
 * desk spot in steps of 100, on the Product Book quote basis (today, issued debentures, the
 * Bid Ask table spread, desk spots, one expiry-close map for every level). A product that
 * fails, or a key not in the book, is null.
 */
export async function POST(req: Request) {
  // Keys only: products always come from the desk's own book, never from the request body.
  const body = (await req.json().catch(() => null)) as { keys?: string[] } | null;
  const keys = [...new Set((body?.keys ?? []).filter((key) => typeof key === "string" && key.length > 0))];
  if (!keys.length) {
    return NextResponse.json(
      { error: `Provide a non-empty keys array (max ${MAX_KEYS} per request).` },
      { status: 400, headers: NO_STORE },
    );
  }
  if (keys.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `Too many keys — send at most ${MAX_KEYS} per request.` },
      { status: 400, headers: NO_STORE },
    );
  }
  const unwindDate = deskTodayISO();
  let loaded: [Awaited<ReturnType<typeof loadMultiDesk>>, Awaited<ReturnType<typeof resolveDeskSpots>>];
  try {
    loaded = await Promise.all([loadMultiDesk(), resolveDeskSpots(unwindDate)]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk spots unavailable";
    return NextResponse.json({ error: message }, { status: 502, headers: NO_STORE });
  }
  const [{ products, surface }, desk] = loaded;
  const byKey = new Map(products.map((product) => [productKey(product), product]));
  const slice = keys.map((key) => byKey.get(key)).filter((p): p is ProductMaster => Boolean(p));

  const priced = await bookScenarioRows({
    products: slice,
    surface,
    nifty: desk.nifty,
    sensex: desk.sensex,
    unwindDate,
    closes: resolveExpirySpots,
  });
  const rows: Record<string, BookScenarioRow | null> = {};
  for (const key of keys) rows[key] = priced[key] ?? null;

  return NextResponse.json(
    { shifts: BOOK_SCENARIO_SHIFTS, rows, nifty: desk.nifty, sensex: desk.sensex, unwindDate },
    { headers: NO_STORE },
  );
}
