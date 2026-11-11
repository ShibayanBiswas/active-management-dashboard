"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DatasetContext, type DatasetContextValue } from "@/lib/context/dataset-provider";
import { DESK_KEY_CANCELLED, useWriteFetch } from "@/lib/context/desk-key-provider";
import { normalizeVolSurface } from "@/lib/engine/vol-surface";
import { issuedCount, productKey, uniqueProductsByIsin } from "@/lib/multi/product-key";
import { productHasLiveMaturity, productsWithLiveMaturity } from "@/lib/observation-tabs";
import type { ProductMaster, UnwindInputs, VolSurface } from "@/lib/types";
import { deskTodayISO, underlyingFromProductName } from "@/lib/utils";
import type { ProductBookQuoteView } from "@/lib/workbook/product-book-rows";
import type { ActiveManagementQuote } from "@/lib/active-management/book-row";

const SELECTED_KEY = "uc-multi-selected-product";

/** Index levels for Expected IRR. Null means the desk spot the quotes were priced at. */
export type AssumedLevels = { nifty: number | null; sensex: number | null };

export function sameAssumedLevels(a: AssumedLevels, b: AssumedLevels): boolean {
  return a.nifty === b.nifty && a.sensex === b.sensex;
}

/** Quiet time after the last Nifty or Sensex keystroke before the book re-prices at the expected level. */
const EXPECTED_LEVEL_DEBOUNCE_MS = 800;

/** The typed level when it is a real level away from the desk spot (half a paisa of tolerance), else null. */
function expectedLevel(typed: number | null | undefined, desk: number | null): number | null {
  if (desk == null || typed == null || !Number.isFinite(typed) || !(typed > 0)) return null;
  return Math.abs(typed - desk) < 0.005 ? null : typed;
}

export type MultiQuote = ProductBookQuoteView & {
  quotePct: number | null;
  /** Null while pending or when the unwind failed. */
  am: ActiveManagementQuote | null;
  /**
   * The expectedLevels sent with the batch that priced this quote (client stamp, not from the route).
   * Expected IRR, Expected Exit Value and Expected Difference are stale while it differs from the
   * current expectedLevels.
   */
  pricedAt: AssumedLevels;
};

function blankQuote(asOf: string, pricedAt: AssumedLevels): MultiQuote {
  return {
    quoteRs: null,
    quotePct: null,
    productIRR: null,
    clientIRR: null,
    residualIRR: null,
    premiumOutflowRs: null,
    asOf,
    economics: null,
    funding: null,
    legs: [],
    am: null,
    pricedAt,
  };
}

export type MultiDeskContextValue = {
  /** Live-maturity products only — Product Book, Unwinding, Pricer. */
  products: ProductMaster[];
  /** Full book including expired maturity — Desk Book Expired tab. */
  allProducts: ProductMaster[];
  selectedKey: string;
  selectProduct: (key: string) => void;
  asOfToday: string;
};

export type MultiQuotesContextValue = {
  quotes: Record<string, MultiQuote>;
  quotesLoading: boolean;
  /** Products priced so far while the live book fills. */
  quotesLoaded: number;
  /** Live-maturity products targeted for the current quote pass. */
  quotesTotal: number;
  /**
   * Read-only levels for Expected IRR, Expected Exit Value and Expected Difference: the Unwinding
   * page's Nifty (Sensex) Spot Level when it differs from today's desk spot, else null (the desk
   * spot). Debounced about 800 ms so typing does not re-quote per keystroke.
   */
  expectedLevels: AssumedLevels;
  /** Desk spots the current quote pass priced at. */
  deskLevels: AssumedLevels;
};

const MultiDeskContext = createContext<MultiDeskContextValue | null>(null);
const MultiQuotesContext = createContext<MultiQuotesContextValue | null>(null);

function todayISO(): string {
  return deskTodayISO();
}

const defaultInputs: UnwindInputs = {
  debentures: 0,
  unwindDate: todayISO(),
  spot: 0,
  sensex: null,
  nifty: null,
  underlying: "Nifty",
  // Bid Ask table: each leg takes its expiry's spread, as in the workbook.
  bidAskSpread: null,
};

async function readApiPayload(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: `Desk API returned ${res.status}.` };
  }
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const issues = Array.isArray(data.issues)
    ? data.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (issues.length) return issues.join(" ");
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  return fallback;
}

function readSelectedKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(SELECTED_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistSelectedKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SELECTED_KEY, key);
  } catch {
    // Private mode may block sessionStorage.
  }
}

export function MultiDatasetProvider({ children }: { children: ReactNode }) {
  const writeFetch = useWriteFetch();
  const [liveBook, setLiveBook] = useState<ProductMaster[]>([]);
  /** Matured products only — loaded in background for Desk Book Expired; never merges into live list. */
  const [maturedExtras, setMaturedExtras] = useState<ProductMaster[]>([]);
  const [surface, setSurface] = useState<VolSurface | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, MultiQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesLoaded, setQuotesLoaded] = useState(0);
  const [quotesTotal, setQuotesTotal] = useState(0);
  const [deskLevels, setDeskLevels] = useState<AssumedLevels>({ nifty: null, sensex: null });
  const [expectedLevels, setExpectedLevels] = useState<AssumedLevels>({ nifty: null, sensex: null });
  const [asOfToday, setAsOfToday] = useState(todayISO);
  const [inputs, setInputsState] = useState<UnwindInputs>(defaultInputs);

  // Expected level follows the Unwinding page's spot levels: today's desk spot by default
  // (null), the edited level once the desk changes it.
  const typedNifty = expectedLevel(inputs.nifty, deskLevels.nifty);
  const typedSensex = expectedLevel(inputs.sensex, deskLevels.sensex);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = { nifty: typedNifty, sensex: typedSensex };
      setExpectedLevels((prev) => (sameAssumedLevels(prev, next) ? prev : next));
    }, EXPECTED_LEVEL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typedNifty, typedSensex]);
  /** Drop late /api/multi/dataset responses so a slow first load cannot overwrite a fresh upload. */
  const refreshGen = useRef(0);

  // Product Book / Unwinding / Pricer / Desk live tabs: unique ISIN + Maturity Date ≥ as-of.
  const products = useMemo(
    () => uniqueProductsByIsin(productsWithLiveMaturity(liveBook, asOfToday)),
    [liveBook, asOfToday],
  );

  // Desk Book Expired tab: live book + matured extras (not one giant replace of live state).
  const allProducts = useMemo(
    () => uniqueProductsByIsin([...liveBook, ...maturedExtras]),
    [liveBook, maturedExtras],
  );

  const product = useMemo(
    () => products.find((item) => productKey(item) === selectedKey) ?? products[0] ?? null,
    [products, selectedKey],
  );

  /**
   * Stable signature so merging the full book for Expired does not restart quote pricing.
   * A new expected level re-runs the pass; the quotes on screen stay until the new ones merge in.
   */
  const quoteRunKey = useMemo(() => {
    if (!surface || !products.length) return "";
    const mid = products[Math.floor(products.length / 2)];
    return [
      asOfToday,
      surface.monthKey,
      String(products.length),
      productKey(products[0]!),
      mid ? productKey(mid) : "",
      productKey(products[products.length - 1]!),
      String(expectedLevels.nifty ?? ""),
      String(expectedLevels.sensex ?? ""),
    ].join("|");
  }, [asOfToday, products, surface, expectedLevels]);

  const productsRef = useRef(products);
  productsRef.current = products;
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const expectedRef = useRef(expectedLevels);
  expectedRef.current = expectedLevels;

  const applySelected = useCallback((next: ProductMaster, prevCode?: string) => {
    const issued = issuedCount(next);
    const inferred = underlyingFromProductName(next.productName, next.productCode);
    setInputsState((prev) => ({
      ...prev,
      productName: next.productName,
      productCode: next.productCode,
      underlying: prevCode && prevCode === next.productCode && prev.underlying ? prev.underlying : inferred,
      debentures: issued,
      unwindDate: todayISO(),
    }));
  }, []);

  const selectProduct = useCallback(
    (key: string) => {
      const next = products.find((item) => productKey(item) === key);
      if (!next || !productHasLiveMaturity(next, asOfToday)) return;
      setSelectedKey(key);
      persistSelectedKey(key);
      applySelected(next, product?.productCode);
    },
    [products, product?.productCode, applySelected, asOfToday],
  );

  const pickLiveKey = useCallback((list: ProductMaster[], preferred: string) => {
    const live = productsWithLiveMaturity(list, todayISO());
    if (preferred && live.some((item) => productKey(item) === preferred)) return preferred;
    return live[0] ? productKey(live[0]) : "";
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current;
    setLoading(true);
    try {
      // Phase 1: live book only — keeps Multiple Home responsive on Vercel.
      const res = await fetch("/api/multi/dataset", { cache: "no-store" });
      const data = (await res.json()) as {
        products?: ProductMaster[];
        surface?: VolSurface;
        asOf?: string;
      };
      if (gen !== refreshGen.current) return;
      const nextProducts = uniqueProductsByIsin(Array.isArray(data.products) ? data.products : []);
      setLiveBook(nextProducts);
      if (data.surface) setSurface(normalizeVolSurface(data.surface));
      const asOf = typeof data.asOf === "string" && data.asOf ? data.asOf : todayISO();
      setAsOfToday(asOf);
      const nextKey = pickLiveKey(nextProducts, readSelectedKey());
      setSelectedKey(nextKey);
      persistSelectedKey(nextKey);
      const selected = productsWithLiveMaturity(nextProducts, asOf).find(
        (item) => productKey(item) === nextKey,
      );
      if (selected) applySelected(selected);
    } finally {
      if (gen === refreshGen.current) setLoading(false);
    }

    // Phase 2: matured products only (Desk Book Expired) — do NOT replace the live book.
    void (async () => {
      try {
        const fullRes = await fetch("/api/multi/dataset?scope=full", { cache: "no-store" });
        if (!fullRes.ok || gen !== refreshGen.current) return;
        const full = (await fullRes.json()) as { products?: ProductMaster[]; surface?: VolSurface };
        if (gen !== refreshGen.current) return;
        const fullBook = uniqueProductsByIsin(Array.isArray(full.products) ? full.products : []);
        if (!fullBook.length) return;
        const asOf = todayISO();
        const liveKeys = new Set(
          productsWithLiveMaturity(fullBook, asOf).map((item) => productKey(item)),
        );
        const matured = fullBook.filter((item) => !liveKeys.has(productKey(item)));
        startTransition(() => {
          setMaturedExtras(matured);
          if (full.surface) setSurface(normalizeVolSurface(full.surface));
        });
      } catch {
        // Live book already loaded — Expired tab can stay live-only if full fetch fails.
      }
    })();
  }, [applySelected, pickLiveKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Segregation is not a stored flag. Each IST day, Maturity Date ≥ as-of is recomputed
  // and the live book is reloaded so an open desk does not keep yesterday's Ongoing list.
  useEffect(() => {
    const rollIfNewDay = () => {
      const next = deskTodayISO();
      if (next === asOfToday) return;
      const book = productsRef.current;
      const stillLive = productsWithLiveMaturity(book, next);
      const justMatured = book.filter((item) => !productHasLiveMaturity(item, next));
      setAsOfToday(next);
      setLiveBook(stillLive);
      if (justMatured.length) {
        setMaturedExtras((prev) => uniqueProductsByIsin([...justMatured, ...prev]));
      }
      void refresh();
    };
    const timer = window.setInterval(rollIfNewDay, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") rollIfNewDay();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", rollIfNewDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", rollIfNewDay);
    };
  }, [asOfToday, refresh]);

  // If as-of rolls or the book changes, drop a matured selection onto the first live product.
  useEffect(() => {
    if (!products.length) return;
    if (product && productKey(product) === selectedKey) return;
    const nextKey = productKey(products[0]!);
    setSelectedKey(nextKey);
    persistSelectedKey(nextKey);
    applySelected(products[0]!);
  }, [products, product, selectedKey, applySelected]);

  useEffect(() => {
    if (!quoteRunKey) return;
    const book = productsRef.current;
    const surf = surfaceRef.current;
    const assumed = expectedRef.current;
    if (!book.length || !surf) return;
    let cancelled = false;
    setQuotesLoading(true);
    setQuotesTotal(0);
    void (async () => {
      try {
        const asOf = todayISO();
        setAsOfToday(asOf);
        // Products with a passed observation feed the Premium Outflow window card; price them first.
        const hasPassedObservation = (item: ProductMaster) =>
          item.legs.some((leg) => String(leg.expiry ?? "").slice(0, 10) <= asOf);
        const live = productsWithLiveMaturity(book, asOf).sort(
          (a, b) => Number(hasPassedObservation(b)) - Number(hasPassedObservation(a)),
        );
        setQuotesTotal(live.length);
        const next: Record<string, MultiQuote> = {};
        const batchSize = 64;
        let lastFlush = 0;
        let pendingFlush = false;
        const flushQuotes = (force = false) => {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          if (!force && now - lastFlush < 900) {
            pendingFlush = true;
            return;
          }
          pendingFlush = false;
          lastFlush = now;
          const snapshot = { ...next };
          const loaded = Object.keys(snapshot).length;
          startTransition(() => {
            // Merge — never wipe the Product Book to blanks mid-run (felt like a hang).
            setQuotes((prev) => ({ ...prev, ...snapshot }));
            setQuotesLoaded(loaded);
          });
        };

        let nifty: number | null = null;
        let sensex: number | null = null;
        let spotsApplied = false;

        for (let i = 0; i < live.length; i += batchSize) {
          if (cancelled) return;
          const slice = live.slice(i, i + batchSize);
          const keys = slice.map((item) => productKey(item));
          try {
            // A dropped batch would leave its products blank for the whole session; retry twice.
            let res = null as Response | null;
            for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
              res = await fetch("/api/multi/quotes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keys, assumed }),
                cache: "no-store",
              }).catch(() => null);
              if (res?.ok) break;
            }
            if (cancelled) return;
            if (res?.ok) {
              const data = (await res.json()) as {
                quotes?: Record<string, Omit<MultiQuote, "pricedAt">>;
                nifty?: number | null;
                sensex?: number | null;
              };
              for (const [key, quote] of Object.entries(data.quotes ?? {})) {
                next[key] = { ...quote, pricedAt: assumed };
              }
              if (typeof data.nifty === "number") nifty = data.nifty;
              if (typeof data.sensex === "number") sensex = data.sensex;
            } else {
              // Do not price hundreds of products on the UI thread — leave blanks.
              for (const item of slice) {
                const key = productKey(item);
                if (!(key in next)) next[key] = blankQuote(asOf, assumed);
              }
            }
          } catch {
            for (const item of slice) {
              const key = productKey(item);
              if (!(key in next)) next[key] = blankQuote(asOf, assumed);
            }
          }

          if (!spotsApplied && (nifty != null || sensex != null)) {
            spotsApplied = true;
            setDeskLevels({ nifty, sensex });
            // A pass priced at an expected level was started by the desk editing a spot level:
            // keep that edit, or writing the desk spot back would clear it and re-price again.
            if (assumed.nifty == null && assumed.sensex == null) {
              setInputsState((prev) => ({
                ...prev,
                nifty,
                sensex,
                spot: prev.underlying === "Sensex" ? (sensex ?? prev.spot) : (nifty ?? prev.spot),
                unwindDate: asOf,
              }));
            }
          }
          flushQuotes(i + batchSize >= live.length);
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });
        }
        if (!cancelled && pendingFlush) flushQuotes(true);
        if (!cancelled) flushQuotes(true);
      } finally {
        if (!cancelled) {
          setQuotesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteRunKey]);

  const applyBook = useCallback(
    (next: { product?: ProductMaster; surface?: VolSurface; products?: ProductMaster[] }) => {
      if (next.surface || next.product || next.products?.length) {
        // Invalidate in-flight refreshes before applying the upload payload.
        refreshGen.current += 1;
      }
      if (next.surface) setSurface(normalizeVolSurface(next.surface));
      if (next.products?.length) {
        const unique = uniqueProductsByIsin(next.products);
        const asOf = todayISO();
        const live = productsWithLiveMaturity(unique, asOf);
        const liveKeys = new Set(live.map((item) => productKey(item)));
        setLiveBook(live);
        setMaturedExtras(unique.filter((item) => !liveKeys.has(productKey(item))));
        setAsOfToday(asOf);
        const preferred = next.product ? productKey(next.product) : selectedKey;
        const current = pickLiveKey(unique, preferred);
        setSelectedKey(current);
        persistSelectedKey(current);
        const selected = live.find((item) => productKey(item) === current);
        if (selected) applySelected(selected);
        return;
      }
      if (next.product) {
        const key = productKey(next.product);
        if (productHasLiveMaturity(next.product, todayISO())) {
          setLiveBook((prev) =>
            uniqueProductsByIsin(
              prev.some((item) => productKey(item) === key)
                ? prev.map((item) => (productKey(item) === key ? next.product! : item))
                : [...prev, next.product!],
            ),
          );
          setSelectedKey(key);
          persistSelectedKey(key);
          applySelected(next.product);
        } else {
          setMaturedExtras((prev) =>
            uniqueProductsByIsin(
              prev.some((item) => productKey(item) === key)
                ? prev.map((item) => (productKey(item) === key ? next.product! : item))
                : [...prev, next.product!],
            ),
          );
        }
      }
    },
    [selectedKey, applySelected, pickLiveKey],
  );

  const setInputs = useCallback((patch: Partial<UnwindInputs>) => {
    setInputsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveSurface = useCallback(async (next: VolSurface): Promise<{ persisted: boolean }> => {
    const payload = normalizeVolSurface(next);
    if (!payload.expiries.length) {
      throw new Error("Add at least one expiry date before saving.");
    }
    const res = await writeFetch("/api/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res) throw new Error(DESK_KEY_CANCELLED);
    const data = await readApiPayload(res);
    if (!res.ok) {
      throw new Error(apiErrorMessage(data, "The Volatility Surface could not be saved."));
    }
    const saved = data.surface && typeof data.surface === "object" ? (data.surface as VolSurface) : payload;
    const persisted = data.persisted === true;
    setSurface(saved);
    return { persisted };
  }, [writeFetch]);

  const saveProduct = useCallback(
    async (next: ProductMaster): Promise<{ persisted: boolean }> => {
      const res = await writeFetch("/api/multi/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        cache: "no-store",
      });
      if (!res) throw new Error(DESK_KEY_CANCELLED);
      const data = await readApiPayload(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "The Product Master could not be saved."));
      }
      const saved = data.product && typeof data.product === "object" ? (data.product as ProductMaster) : next;
      const persisted = data.persisted === true;
      const key = productKey(saved);
      if (productHasLiveMaturity(saved, todayISO())) {
        setLiveBook((prev) => prev.map((item) => (productKey(item) === key ? saved : item)));
        setSelectedKey(key);
        persistSelectedKey(key);
        applySelected(saved);
      } else {
        setMaturedExtras((prev) => prev.map((item) => (productKey(item) === key ? saved : item)));
      }
      return { persisted };
    },
    [applySelected, writeFetch],
  );

  const deskValue = useMemo<MultiDeskContextValue>(
    () => ({
      products,
      allProducts,
      selectedKey: product ? productKey(product) : selectedKey,
      selectProduct,
      asOfToday,
    }),
    [products, allProducts, product, selectedKey, selectProduct, asOfToday],
  );

  const quotesValue = useMemo<MultiQuotesContextValue>(
    () => ({
      quotes,
      quotesLoading,
      quotesLoaded,
      quotesTotal,
      expectedLevels,
      deskLevels,
    }),
    [quotes, quotesLoading, quotesLoaded, quotesTotal, expectedLevels, deskLevels],
  );

  const datasetValue = useMemo<DatasetContextValue>(
    () => ({
      product,
      surface,
      loading,
      inputs,
      setInputs,
      refresh,
      applyBook,
      saveProduct,
      saveSurface,
    }),
    [product, surface, loading, inputs, setInputs, refresh, applyBook, saveProduct, saveSurface],
  );

  return (
    <MultiDeskContext.Provider value={deskValue}>
      <MultiQuotesContext.Provider value={quotesValue}>
        <DatasetContext.Provider value={datasetValue}>{children}</DatasetContext.Provider>
      </MultiQuotesContext.Provider>
    </MultiDeskContext.Provider>
  );
}

export function useMultiDesk(): MultiDeskContextValue {
  const ctx = useContext(MultiDeskContext);
  if (!ctx) throw new Error("useMultiDesk requires MultiDatasetProvider");
  return ctx;
}

export function useMultiQuotes(): MultiQuotesContextValue {
  const ctx = useContext(MultiQuotesContext);
  if (!ctx) throw new Error("useMultiQuotes requires MultiDatasetProvider");
  return ctx;
}

export function useMultiDeskOptional(): MultiDeskContextValue | null {
  return useContext(MultiDeskContext);
}
