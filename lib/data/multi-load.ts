import { COLLECTIONS, getDb } from "@/lib/db/mongo";
import { toPlainProduct, toPlainSurface, loadActiveVolSurface } from "@/lib/data/load";
import { MULTI_BOOK_LEG_COUNT, MULTI_BOOK_PRODUCT_COUNT } from "@/lib/multi/book-stats";
import { productKey, uniqueProductsByIsin } from "@/lib/multi/product-key";
import type { ProductMaster, VolSurface } from "@/lib/types";

import multiSeed from "@/lib/data/multi-products-seed.json";

const BOOK_KEY = "multi-desk";
const META_KIND = "book-meta";

type BookMeta = {
  bookKey: string;
  kind: typeof META_KIND;
  isActive: boolean;
  productCount: number;
  legCount: number;
  source: string;
  seedFingerprint: string;
  /** Fingerprint of the deployment seed that was live when this book was written. */
  baseSeedFingerprint?: string;
  updatedAt: Date;
};

let runtimeProducts: ProductMaster[] | null = null;

function seedFingerprint(products: ProductMaster[]): string {
  const unique = uniqueProductsByIsin(products);
  const legs = unique.reduce((sum, product) => sum + product.legs.length, 0);
  const first = unique[0] ? productKey(unique[0]) : "";
  const last = unique.length ? productKey(unique[unique.length - 1]!) : "";
  // Mix names, payoff text, and option expiries so a master rewrite cannot match an older deployment seed.
  let mix = 0;
  const fold = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      mix = (Math.imul(mix, 33) + text.charCodeAt(i)) >>> 0;
    }
  };
  for (const product of unique) {
    fold(product.productName);
    fold(product.formulae ?? "");
    for (const leg of product.legs) {
      fold(String(leg.expiry ?? "").slice(0, 10));
      fold(String(leg.strike ?? ""));
      fold(String(leg.spreads ?? ""));
      fold(String(leg.prdPrice ?? ""));
      fold(String(leg.originalSide ?? ""));
    }
  }
  return `${unique.length}:${legs}:${first}:${last}:${mix.toString(16)}`;
}

function bakedSeedProducts(): ProductMaster[] {
  return uniqueProductsByIsin((multiSeed as ProductMaster[]).map(toPlainProduct));
}

function bakedSeedFingerprint(): string {
  return seedFingerprint(multiSeed as ProductMaster[]);
}

function isProductDoc(doc: Record<string, unknown>): boolean {
  return doc.kind !== META_KIND && typeof doc.productName === "string";
}

export function rememberMultiProducts(products: ProductMaster[]) {
  runtimeProducts = uniqueProductsByIsin(products.map(toPlainProduct));
}

async function writeBookMeta(products: ProductMaster[], source: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const plain = uniqueProductsByIsin(products.map(toPlainProduct));
  const meta: BookMeta = {
    bookKey: BOOK_KEY,
    kind: META_KIND,
    isActive: false,
    productCount: plain.length,
    legCount: plain.reduce((sum, product) => sum + product.legs.length, 0),
    source,
    seedFingerprint: seedFingerprint(plain),
    baseSeedFingerprint: bakedSeedFingerprint(),
    updatedAt: new Date(),
  };
  await db.collection(COLLECTIONS.multiProducts).replaceOne(
    { bookKey: BOOK_KEY, kind: META_KIND },
    meta,
    { upsert: true },
  );
}

export async function persistMultiProducts(products: ProductMaster[], source: string): Promise<boolean> {
  const plain = uniqueProductsByIsin(products.map(toPlainProduct));
  rememberMultiProducts(plain);
  const db = await getDb();
  if (!db) return false;
  const col = db.collection(COLLECTIONS.multiProducts);
  await col.deleteMany({ bookKey: BOOK_KEY });
  if (plain.length) {
    await col.insertMany(
      plain.map((product) => ({
        ...product,
        bookKey: BOOK_KEY,
        isActive: true,
        source,
        updatedAt: new Date(),
        productKey: productKey(product),
      })),
    );
  }
  await writeBookMeta(plain, source);
  return true;
}

export async function persistMultiProduct(product: ProductMaster, source: string): Promise<boolean> {
  const plain = toPlainProduct(product);
  const key = productKey(plain);
  const code = plain.productCode.trim();
  // A cold lambda has no book in memory yet; merge into the full book, not an empty one.
  const base = runtimeProducts ?? (await loadMultiProducts());
  runtimeProducts = uniqueProductsByIsin(
    base
      .filter((item) => productKey(item) !== key)
      .concat(plain),
  );
  const db = await getDb();
  if (!db) return false;
  await db.collection(COLLECTIONS.multiProducts).updateOne(
    {
      bookKey: BOOK_KEY,
      kind: { $ne: META_KIND },
      $or: [{ productKey: key }, ...(code ? [{ productCode: code }, { productCode: code.toUpperCase() }] : [])],
    },
    {
      $set: {
        ...plain,
        bookKey: BOOK_KEY,
        isActive: true,
        source,
        updatedAt: new Date(),
        productKey: key,
      },
      $unset: { kind: "" },
    },
    { upsert: true },
  );
  await writeBookMeta(runtimeProducts, source);
  return true;
}

export async function loadMultiProducts(): Promise<ProductMaster[]> {
  if (runtimeProducts?.length) return runtimeProducts;

  const db = await getDb();
  if (db) {
    try {
      const col = db.collection(COLLECTIONS.multiProducts);
      const meta = (await col.findOne({ bookKey: BOOK_KEY, kind: META_KIND })) as BookMeta | null;
      const seedFp = bakedSeedFingerprint();

      // Fast path: Atlas book still matches the collated seed shipped in the deployment.
      // Avoids pulling ~17 MB / 2,505 docs from Atlas on every cold Vercel lambda.
      if (meta?.seedFingerprint === seedFp) {
        const seeded = bakedSeedProducts();
        runtimeProducts = seeded;
        return seeded;
      }

      // An Atlas book written against an older deployment seed is stale: the file shipped
      // with this deployment wins. A desk upload or edit made on this seed loads from Atlas below.
      if (meta && meta.baseSeedFingerprint !== seedFp) {
        const seeded = bakedSeedProducts();
        runtimeProducts = seeded;
        return seeded;
      }

      if (!meta) {
        const productCount = await col.countDocuments({
          bookKey: BOOK_KEY,
          isActive: true,
          kind: { $ne: META_KIND },
          productName: { $type: "string" },
        });
        const seedFirst = (multiSeed as ProductMaster[])[0];
        const seedFirstKey = seedFirst ? productKey(seedFirst) : "";
        if (productCount === MULTI_BOOK_PRODUCT_COUNT && seedFirstKey) {
          const sample = await col.findOne({
            bookKey: BOOK_KEY,
            isActive: true,
            kind: { $ne: META_KIND },
            productKey: seedFirstKey,
          });
          if (sample) {
            const seeded = bakedSeedProducts();
            runtimeProducts = seeded;
            await writeBookMeta(seeded, "seed-fast-path-migrate");
            return seeded;
          }
        }
      }

      const docs = await col.find({ bookKey: BOOK_KEY, isActive: true }).toArray();
      const products = uniqueProductsByIsin(
        docs
          .filter((doc) => isProductDoc(doc as Record<string, unknown>))
          .map((doc) => toPlainProduct(doc as unknown as ProductMaster)),
      );
      if (products.length) {
        runtimeProducts = products;
        if (!meta || meta.productCount !== products.length) {
          await writeBookMeta(products, meta?.source ?? "mongo-load");
        }
        return products;
      }
    } catch (err) {
      console.error("[load] multi products", err);
    }
  }
  if (runtimeProducts?.length) return runtimeProducts;
  const seeded = bakedSeedProducts();
  runtimeProducts = seeded;
  return seeded;
}

export async function loadMultiDesk(): Promise<{ products: ProductMaster[]; surface: VolSurface }> {
  const [products, surface] = await Promise.all([loadMultiProducts(), loadActiveVolSurface()]);
  return { products, surface: toPlainSurface(surface) };
}

/** Seed shape constants used by audits. */
export const MULTI_SEED_SHAPE = {
  productCount: MULTI_BOOK_PRODUCT_COUNT,
  legCount: MULTI_BOOK_LEG_COUNT,
  fingerprint: bakedSeedFingerprint(),
} as const;
