import { NextResponse } from "next/server";

import { istTimestamp } from "@/lib/dates";
import { COLLECTIONS, getDb } from "@/lib/db/mongo";
import { fetchLiveMarketLevels } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Database connectivity, document counts and the latest Nifty close. No secrets, nothing written. */
export async function GET() {
  const [db, levels] = await Promise.all([getDb(), fetchLiveMarketLevels().catch(() => null)]);
  let database: Record<string, unknown> = { connected: false, configured: Boolean(process.env.MONGODB_URI) };
  if (db) {
    try {
      const counts = await Promise.all(Object.values(COLLECTIONS).map((name) => db.collection(name).estimatedDocumentCount()));
      database = {
        connected: true,
        name: db.databaseName,
        collections: Object.fromEntries(Object.values(COLLECTIONS).map((name, i) => [name, counts[i]])),
        bookSource: counts[0] > 0 ? "mongo" : "seed",
      };
    } catch {
      database = { connected: false, name: db.databaseName };
    }
  }
  const market = { source: levels?.source ?? "unavailable", nifty: levels?.niftyLevel ?? null, latestCloseDate: levels?.priceAsOfDate ?? null };
  const ok = database.connected === true;
  return NextResponse.json(
    {
      status: ok ? (market.source === "yahoo" ? "ok" : "degraded") : "degraded",
      environment: process.env.VERCEL_ENV ?? "local",
      database,
      market,
      checkedAt: istTimestamp(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
