import { NextResponse } from "next/server";

import { fetchLiveMarketLevels } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Last completed Nifty close from Yahoo. */
export async function GET() {
  const levels = await fetchLiveMarketLevels();
  return NextResponse.json(levels, { status: levels.source === "yahoo" ? 200 : 502, headers: { "Cache-Control": "no-store, max-age=0" } });
}
