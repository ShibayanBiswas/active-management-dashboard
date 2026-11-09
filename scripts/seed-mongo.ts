import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { COLLECTIONS, getDb } from "../lib/db/mongo";
import { persistMultiProducts } from "../lib/data/multi-load";
import multiSeed from "../lib/data/multi-products-seed.json";
import volSeed from "../lib/data/vol-surface-seed.json";
import type { ProductMaster } from "../lib/types";

async function main() {
  console.log("URI set:", Boolean(process.env.MONGODB_URI));
  const db = await getDb();
  if (!db) {
    console.error("MongoDB unavailable — check MONGODB_URI");
    process.exit(1);
  }

  await db.collection(COLLECTIONS.volSurfaces).updateMany({}, { $set: { isActive: false } });
  await db.collection(COLLECTIONS.volSurfaces).updateOne(
    { monthKey: volSeed.monthKey },
    { $set: { ...volSeed, isActive: true, source: "seed", updatedAt: new Date() } },
    { upsert: true },
  );
  console.log("Upserted active vol surface", volSeed.monthKey);

  const multiPersisted = await persistMultiProducts(multiSeed as ProductMaster[], "new-primary-observation-sync");
  console.log("Multi book persisted", multiPersisted, (multiSeed as ProductMaster[]).length);

  console.log(`Seed complete → database ${process.env.MONGODB_DB ?? "active_management"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
