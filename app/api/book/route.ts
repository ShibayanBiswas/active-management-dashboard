import { NextResponse } from "next/server";

import { loadDeskData } from "@/lib/data/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** The active desk book: products, surface, chains, fixings and spreads, plus the live as-of inputs. */
export async function GET() {
  const data = await loadDeskData();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
