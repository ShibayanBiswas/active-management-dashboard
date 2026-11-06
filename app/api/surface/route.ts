import { NextResponse } from "next/server";

import { loadDeskData } from "@/lib/data/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Active volatility surface and bid ask spread table. */
export async function GET() {
  const { surface, bidAsk } = await loadDeskData();
  return NextResponse.json({ surface, bidAsk }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
