import { NextResponse } from "next/server";

import { resolveExpirySpots } from "@/lib/engine/expiry-spots";
import type { UnderlyingIndex } from "@/lib/types";
import { deskTodayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    dates?: string[];
    underlying?: UnderlyingIndex | "";
  } | null;

  const dates = Array.isArray(body?.dates)
    ? body.dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    : [];
  const underlying = body?.underlying === "Sensex" ? "Sensex" : "Nifty";

  if (dates.length === 0) {
    return NextResponse.json({ underlying, spots: {} });
  }
  if (dates.length > 500) {
    return NextResponse.json({ error: "Send at most 500 dates per request." }, { status: 400 });
  }

  const spots = await resolveExpirySpots(dates, underlying);
  return NextResponse.json(
    { underlying, spots },
    // A close for today is not final until the session ends, so only past days are cacheable.
    { headers: { "Cache-Control": dates.some((d) => d.slice(0, 10) >= deskTodayISO()) ? "no-store" : "private, max-age=3600" } },
  );
}
