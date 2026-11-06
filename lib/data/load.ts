import type { Db } from "mongodb";

import { SEED } from "@/lib/data/seed";
import { deskTodayISO } from "@/lib/dates";
import { COLLECTIONS, getDb } from "@/lib/db/mongo";
import { fetchLiveMarketLevels, fetchNiftyClosesOnOrBefore } from "@/lib/market-data";
import type { BidAskPoint, DeskData, Fixing, OptionChain, Product, VolSurface } from "@/lib/types";

type SurfaceDoc = VolSurface & { bidAsk?: BidAskPoint[] };

async function readStored(db: Db | null) {
  if (!db) return { products: [] as Product[], surface: null as SurfaceDoc | null, chains: [] as OptionChain[], fixings: [] as Fixing[] };
  const [products, surface, chains, fixings] = await Promise.all([
    db.collection<Product>(COLLECTIONS.products).find({}, { projection: { _id: 0, order: 0 } }).sort({ order: 1 }).toArray(),
    db.collection<SurfaceDoc>(COLLECTIONS.volSurfaces).findOne({ active: true }, { projection: { _id: 0, active: 0, uploadedAt: 0 } }),
    db.collection<OptionChain>(COLLECTIONS.optionChains).find({}, { projection: { _id: 0 } }).sort({ month: 1 }).toArray(),
    db.collection<Fixing>(COLLECTIONS.fixings).find({}, { projection: { _id: 0, source: 0 } }).toArray(),
  ]);
  return { products: products as Product[], surface, chains: chains as OptionChain[], fixings: fixings as Fixing[] };
}

/** Dates the book needs a Nifty close for: observations and option expiries up to today. */
function neededFixingDates(products: Product[], today: string): string[] {
  const dates = new Set<string>();
  for (const p of products) {
    for (const d of p.observationDates) if (d <= today) dates.add(d);
    for (const leg of p.legs) if (leg.expiry <= today) dates.add(leg.expiry);
  }
  return [...dates].sort();
}

/**
 * Active desk book: Mongo first, the baked seed for anything Mongo does not hold. Missing fixings are fetched from
 * Yahoo and cached in Mongo, and the current Nifty is the last completed Yahoo close.
 */
export async function loadDeskData(): Promise<DeskData> {
  const db = await getDb();
  const stored = await readStored(db).catch(() => readStored(null));
  const products = stored.products.length ? stored.products : SEED.products;
  const surface: SurfaceDoc = stored.surface ?? { ...SEED.surface, bidAsk: SEED.bidAsk };
  const chains = stored.chains.length ? stored.chains : SEED.chains;

  const byDate = new Map<string, number>();
  for (const f of SEED.fixings) byDate.set(f.date, f.close);
  for (const f of stored.fixings) byDate.set(f.date, f.close);

  const today = deskTodayISO();
  const missing = neededFixingDates(products, today).filter((d) => !byDate.has(d));
  const [fetched, levels] = await Promise.all([
    missing.length ? fetchNiftyClosesOnOrBefore(missing).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
    fetchLiveMarketLevels().catch(() => null),
  ]);
  for (const [date, close] of fetched) byDate.set(date, close);
  if (db && fetched.size) {
    await db
      .collection(COLLECTIONS.fixings)
      .bulkWrite([...fetched].map(([date, close]) => ({ updateOne: { filter: { date }, update: { $set: { date, close, source: "yahoo" } }, upsert: true } })))
      .catch(() => undefined);
  }

  const live = levels?.niftyLevel ?? null;
  const asOf = live
    ? { valuationDate: today, currentNifty: live, assumedNifty: Math.round(live / 100) * 100 }
    : SEED.asOf;

  const { bidAsk, ...grid } = surface;
  return {
    asOf,
    products,
    surface: grid,
    chains,
    fixings: [...byDate].map(([date, close]) => ({ date, close })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    bidAsk: bidAsk?.length ? bidAsk : SEED.bidAsk,
    source: stored.products.length ? "mongo" : "seed",
    liveFixings: fetched.size,
  };
}
