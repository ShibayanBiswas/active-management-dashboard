import { NextResponse } from "next/server";

import { guardWrite, MAX_JSON_BYTES } from "@/lib/api/write-guard";
import { looksLikeSurface, persistActiveSurface, presentSurfaceForDeskMonth, toPlainSurface } from "@/lib/data/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = guardWrite(req, MAX_JSON_BYTES);
  if (blocked) return blocked;
  try {
    const body = await req.json().catch(() => null);
    if (!looksLikeSurface(body)) {
      return NextResponse.json(
        {
          error: "Volatility Surface is incomplete",
          issues: ["Keep at least one expiry row and the Deep strike column before saving."],
        },
        { status: 400 },
      );
    }

    const surface = toPlainSurface(body);
    if (!surface.expiries.length) {
      return NextResponse.json(
        {
          error: "Volatility Surface has no expiry rows",
          issues: ["Add at least one expiry date before saving."],
        },
        { status: 400 },
      );
    }

    const persisted = await persistActiveSurface(surface, "desk-edit");
    return NextResponse.json({ ok: true, surface: await presentSurfaceForDeskMonth(surface), persisted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk database write failed";
    return NextResponse.json(
      {
        error: "The Volatility Surface could not be saved.",
        issues: [message],
      },
      { status: 500 },
    );
  }
}
