"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import type { BookScenarioRow } from "@/lib/active-management/book-scenario";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDesk } from "@/lib/context/multi-desk-provider";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";

type Rows = Record<string, BookScenarioRow | null>;

const BATCH_SIZE = 16;

/**
 * Rows already priced, by desk date and surface month, for the session: reopening the table or
 * changing its filter only prices the products not seen yet. A product the route could not price
 * is kept as null; a request that failed three times is not kept, so the next pass retries it.
 */
const cache = new Map<string, Rows>();

/**
 * Book scenario table data: one row per product with its 21 levels from −1,000 to +1,000 around
 * the desk spot, from POST /api/multi/scenarios on the Product Book basis. Starts only when
 * enabled, 16 products per request with two retries, and shows progress about every 900 ms.
 */
export function useBookScenarios({ products, enabled }: { products: ProductMaster[]; enabled: boolean }): {
  rows: Rows;
  loading: boolean;
  loaded: number;
  total: number;
} {
  const { asOfToday } = useMultiDesk();
  const { surface } = useDataset();
  const month = surface?.monthKey ?? "";
  const cacheKey = `${asOfToday}|${month}`;
  const keys = useMemo(() => [...new Set(products.map((item) => productKey(item)))], [products]);
  const signature = keys.join("\n");
  const [rows, setRows] = useState<Rows>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !month) {
      setLoading(false);
      return;
    }
    const wanted = signature ? signature.split("\n") : [];
    const store = cache.get(cacheKey) ?? {};
    cache.set(cacheKey, store);
    /** This pass's view: the cache plus batches that failed outright (shown blank, not cached). */
    const view: Rows = {};
    for (const key of wanted) if (key in store) view[key] = store[key] ?? null;
    setRows({ ...view });
    const pending = wanted.filter((key) => !(key in store));
    if (!pending.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      let lastFlush = 0;
      const flush = (force: boolean) => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (!force && now - lastFlush < 900) return;
        lastFlush = now;
        const snapshot = { ...view };
        startTransition(() => setRows(snapshot));
      };
      try {
        for (let i = 0; i < pending.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const slice = pending.slice(i, i + BATCH_SIZE);
          let res = null as Response | null;
          for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
            res = await fetch("/api/multi/scenarios", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keys: slice }),
              cache: "no-store",
            }).catch(() => null);
            if (res?.ok) break;
          }
          if (cancelled) return;
          const data = res?.ok ? ((await res.json().catch(() => null)) as { rows?: Rows } | null) : null;
          for (const key of slice) {
            const row = data?.rows?.[key] ?? null;
            if (data?.rows) store[key] = row;
            view[key] = row;
          }
          flush(i + BATCH_SIZE >= pending.length);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, month, cacheKey, signature]);

  const loaded = useMemo(() => keys.filter((key) => key in rows).length, [keys, rows]);
  return { rows, loading, loaded, total: keys.length };
}
