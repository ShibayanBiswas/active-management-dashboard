import { NextResponse } from "next/server";

import { fetchLiveMarketLevels } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const levels = await fetchLiveMarketLevels();
  return NextResponse.json(levels, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
