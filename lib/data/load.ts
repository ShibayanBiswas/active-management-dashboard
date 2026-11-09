import { COLLECTIONS, getDb, isWriteConcernError } from "@/lib/db/mongo";
import volSeed from "@/lib/data/vol-surface-seed.json";
import { bookPremiumFraction } from "@/lib/engine/product-premium";
import { labelSurfaceForDeskMonth } from "@/lib/engine/vol-surface";
import { fetchIndexAtDate } from "@/lib/market-data";
import { deskTodayISO } from "@/lib/utils";
import { normalizeVolSurface } from "@/lib/engine/vol-surface";
import type { OptionLeg, ProductMaster, VolSurface } from "@/lib/types";

/** Same-instance cache when Mongo is unreachable. Vercel always prefers Mongo. */
let runtimeSurface: VolSurface | null = null;

function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stripDeskMeta<T>(doc: T & { _id?: unknown; isActive?: unknown; source?: unknown; updatedAt?: unknown }): T {
  const { _id, isActive, source, updatedAt, ...rest } = doc;
  void _id;
  void isActive;
  void source;
  void updatedAt;
  return rest as T;
}

export function toPlainSurface(surface: VolSurface): VolSurface {
  return normalizeVolSurface(surface);
}

export function toPlainProduct(product: ProductMaster): ProductMaster {
  const plain: ProductMaster = {
    productName: String(product.productName ?? "").trim(),
    productCode: String(product.productCode ?? "").trim(),
    tradeDate: String(product.tradeDate ?? ""),
    allotmentDate: String(product.allotmentDate ?? ""),
    maturityDate: String(product.maturityDate ?? ""),
    deltaDate: String(product.deltaDate ?? ""),
    tenorDays: finiteNumber(product.tenorDays),
    mobilization: finiteNumber(product.mobilization),
    unwinds: finiteNumber(product.unwinds),
    initialNiftyLevel: finiteNumber(product.initialNiftyLevel),
    contingentLevel: (() => {
      const contingent = finiteNumber(product.contingentLevel);
      const initial = finiteNumber(product.initialNiftyLevel);
      return contingent > 0 ? contingent : initial;
    })(),
    prdDiscRate: finiteNumber(product.prdDiscRate),
    premDiscRate: finiteNumber(product.premDiscRate),
    formulae: String(product.formulae ?? ""),
    coupon: finiteNumber(product.coupon),
    faceValue: finiteNumber(product.faceValue),
    inbuilt: finiteNumber(product.inbuilt),
    tranCost: finiteNumber(product.tranCost),
    issuanceCost: finiteNumber(product.issuanceCost),
    marginCost: finiteNumber(product.marginCost),
    marginFundingRate: finiteNumber(product.marginFundingRate),
    totalFundsForMargin: finiteNumber(product.totalFundsForMargin),
    prdPrice: finiteNumber(product.prdPrice),
    legs: (product.legs ?? []).map(
      (leg): OptionLeg => ({
        optionType: String(leg.optionType ?? ""),
        strike: finiteNumber(leg.strike),
        spreads: finiteNumber(leg.spreads),
        originalSide: String(leg.originalSide ?? ""),
        expiry: String(leg.expiry ?? ""),
        reqQuantity: leg.reqQuantity == null ? undefined : finiteNumber(leg.reqQuantity),
        sdCode: leg.sdCode == null ? undefined : String(leg.sdCode),
        prdPrice: leg.prdPrice == null ? undefined : finiteNumber(leg.prdPrice),
        unwindPrice:
          leg.unwindPrice == null || !Number.isFinite(Number(leg.unwindPrice))
            ? null
            : finiteNumber(leg.unwindPrice),
        qtyDivisor: leg.qtyDivisor == null ? undefined : finiteNumber(leg.qtyDivisor, 1),
      }),
    ),
  };
  plain.premiumFraction = bookPremiumFraction(plain);
  return plain;
}

export function looksLikeSurface(value: unknown): value is VolSurface {
  if (!value || typeof value !== "object") return false;
  const surface = value as VolSurface;
  return Array.isArray(surface.expiries) && surface.expiries.length > 0 && Array.isArray(surface.volsPercent);
}

export function looksLikeProduct(value: unknown): value is ProductMaster {
  if (!value || typeof value !== "object") return false;
  const product = value as ProductMaster;
  return (
    typeof product.productName === "string" &&
    product.productName.trim().length > 0 &&
    typeof product.productCode === "string" &&
    Array.isArray(product.legs) &&
    product.legs.length > 0 &&
    product.legs.every(
      (leg) =>
        leg &&
        typeof leg.optionType === "string" &&
        Number.isFinite(Number(leg.strike)) &&
        typeof leg.expiry === "string",
    )
  );
}

export function rememberUploadedSurface(surface: VolSurface) {
  runtimeSurface = toPlainSurface(surface);
}

async function writeWithRetry(label: string, op: (acknowledged: boolean) => Promise<void>): Promise<void> {
  try {
    await op(true);
  } catch (err) {
    if (!isWriteConcernError(err)) {
      console.error(`[persist] ${label}`, err);
      throw new Error(err instanceof Error ? err.message : `${label} could not be written to the desk database.`);
    }
    try {
      await op(false);
    } catch (retryErr) {
      console.error(`[persist] ${label} retry`, retryErr);
      throw new Error(
        retryErr instanceof Error ? retryErr.message : `${label} could not be written to the desk database.`,
      );
    }
  }
}

export async function persistActiveSurface(surface: VolSurface, source: string): Promise<boolean> {
  const plain = toPlainSurface(surface);
  rememberUploadedSurface(plain);
  const db = await getDb();
  if (!db) return false;
  await writeWithRetry("vol surface", async (acknowledged) => {
    const wc = acknowledged ? undefined : { writeConcern: { w: 1 as const } };
    await db.collection(COLLECTIONS.volSurfaces).updateMany({}, { $set: { isActive: false } }, wc);
    await db.collection(COLLECTIONS.volSurfaces).updateOne(
      { monthKey: plain.monthKey },
      {
        $set: {
          ...plain,
          isActive: true,
          source,
          updatedAt: new Date(),
        },
      },
      { upsert: true, ...wc },
    );
    await db.collection(COLLECTIONS.uploadLogs).insertOne(
      {
        type: "vol_surface",
        filename: source,
        monthKey: plain.monthKey,
        at: new Date(),
      },
      wc,
    );
  });
  return true;
}

/** Asia/Kolkata calendar month, YYYY-MM. */
export function deskMonthKey(today = deskTodayISO()): string {
  return today.slice(0, 7);
}

function surfaceHasGrid(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const expiries = (doc as { expiries?: unknown }).expiries;
  return Array.isArray(expiries) && expiries.length > 0;
}

/**
 * Current IST month when that surface has a vol grid.
 * Otherwise the latest earlier month, so last month's name and reference prices continue
 * until this month's file is uploaded.
 */
export function pickCarriedVolSurface<T extends { monthKey?: string; expiries?: unknown }>(
  docs: T[],
  todayMonth: string,
): T | null {
  const usable = docs.filter(
    (doc) => /^\d{4}-\d{2}$/.test(String(doc.monthKey ?? "")) && surfaceHasGrid(doc),
  );
  const current = usable.find((doc) => doc.monthKey === todayMonth);
  if (current) return current;
  const earlier = usable
    .filter((doc) => String(doc.monthKey) <= todayMonth)
    .sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));
  return earlier[0] ?? null;
}

/**
 * Current IST month if that surface is stored, otherwise the latest earlier month.
 * A carried grid is shown under the current month name, with that month's reference prices.
 */
export async function loadActiveVolSurface(): Promise<VolSurface> {
  const db = await getDb();
  if (db) {
    try {
      const monthKey = deskMonthKey();
      const col = db.collection(COLLECTIONS.volSurfaces);
      const current = await col.findOne({ monthKey });
      const doc = surfaceHasGrid(current)
        ? current
        : await col
            .find({ monthKey: { $lte: monthKey }, "expiries.0": { $exists: true } })
            .sort({ monthKey: -1 })
            .limit(1)
            .next();
      if (doc) {
        const stored = stripDeskMeta(doc as unknown as VolSurface & { _id?: unknown });
        const plain = toPlainSurface(stored);
        const storedNifty = Number(stored.referenceUnderlyingPrice);
        const storedSensex = Number(stored.referenceSensexPrice);
        const niftyMoved = Math.abs((plain.referenceUnderlyingPrice ?? 0) - storedNifty) > 1e-6;
        const sensexMoved = Math.abs((plain.referenceSensexPrice ?? 0) - storedSensex) > 1e-6;
        if (niftyMoved || sensexMoved) {
          void persistActiveSurface(plain, `monthly-ref-${plain.monthKey}`).catch((err) => {
            console.error("[load] monthly reference repair", err);
          });
        }
        return presentSurfaceForDeskMonth(plain);
      }
    } catch (err) {
      console.error("[load] vol surface", err);
    }
  }
  if (runtimeSurface) return presentSurfaceForDeskMonth(toPlainSurface(runtimeSurface));
  return presentSurfaceForDeskMonth(toPlainSurface(volSeed as VolSurface));
}

const monthAnchorCache = new Map<string, { nifty: number | null; sensex: number | null }>();

/** Yahoo Nifty / Sensex close on or before the 1st of a month: that month's 100% anchors. */
async function monthAnchors(monthKey: string): Promise<{ nifty: number | null; sensex: number | null }> {
  const cached = monthAnchorCache.get(monthKey);
  if (cached) return cached;
  const levels = await fetchIndexAtDate(`${monthKey}-01`).catch(() => null);
  const anchors = { nifty: levels?.niftyLevel ?? null, sensex: levels?.sensexLevel ?? null };
  // Keep a Yahoo miss out of the cache so the month's anchors are retried, not pinned. On the
  // 1st the session close is not final until 15:30 IST, so that day is not cached either.
  const anchorFinal = `${monthKey}-01` < deskTodayISO();
  if (anchors.nifty != null && anchors.sensex != null && anchorFinal) monthAnchorCache.set(monthKey, anchors);
  return anchors;
}

/**
 * Show the current month. Carry the previous vol grid when this month has no upload.
 * The reference prices are always the month's Yahoo closes on or before the 1st, uploaded or carried;
 * the surface's own prices are kept only when Yahoo has none. Never the live spot.
 */
export async function presentSurfaceForDeskMonth(surface: VolSurface): Promise<VolSurface> {
  const todayMonth = deskMonthKey();
  if (surface.monthKey >= todayMonth) {
    const hasNifty = Number(surface.referenceUnderlyingPrice) > 0;
    const hasSensex = Number(surface.referenceSensexPrice) > 0;
    const anchors = await monthAnchors(surface.monthKey);
    return normalizeVolSurface({
      ...surface,
      referenceUnderlyingPrice: anchors.nifty ?? (hasNifty ? surface.referenceUnderlyingPrice : undefined),
      referenceSensexPrice: anchors.sensex ?? (hasSensex ? surface.referenceSensexPrice : undefined),
    });
  }
  return labelSurfaceForDeskMonth(surface, todayMonth, await monthAnchors(todayMonth));
}

export function issuedDebentures(product: ProductMaster): number {
  if (!product.faceValue) return 1;
  return Math.max(1, Math.round(product.mobilization / product.faceValue));
}
