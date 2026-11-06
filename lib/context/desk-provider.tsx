"use client";

import { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

import { defaultInputs } from "@/lib/desk-defaults";
import { computeBook, type Book } from "@/lib/engine/book";
import type { DeskData, DeskInputs } from "@/lib/types";

type DeskState = {
  data: DeskData | null;
  book: Book | null;
  inputs: DeskInputs | null;
  loading: boolean;
  error: string | null;
  setInputs: (patch: Partial<DeskInputs>) => void;
  resetInputs: () => void;
  reload: () => Promise<void>;
  refreshSpot: () => Promise<string | null>;
};

const DeskContext = createContext<DeskState | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DeskData | null>(null);
  const [inputs, setInputsState] = useState<DeskInputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/book", { cache: "no-store" });
      if (!res.ok) throw new Error(`Book Request Failed With ${res.status}`);
      const next = (await res.json()) as DeskData;
      setData(next);
      setInputsState((prev) => prev ?? defaultInputs(next.asOf));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Book Could Not Be Loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setInputs = useCallback((patch: Partial<DeskInputs>) => setInputsState((prev) => (prev ? { ...prev, ...patch } : prev)), []);
  const resetInputs = useCallback(() => {
    if (data) setInputsState(defaultInputs(data.asOf));
  }, [data]);

  const refreshSpot = useCallback(async () => {
    const res = await fetch("/api/market/spot", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { niftyLevel: number | null; priceAsOfDate: string | null }) : null;
    if (!body?.niftyLevel) return "Live Nifty Unavailable";
    setInputs({ currentNifty: body.niftyLevel });
    return null;
  }, [setInputs]);

  const deferredInputs = useDeferredValue(inputs);
  const book = useMemo(() => (data && deferredInputs ? computeBook(data, deferredInputs) : null), [data, deferredInputs]);

  const value = useMemo(
    () => ({ data, book, inputs, loading, error, setInputs, resetInputs, reload, refreshSpot }),
    [data, book, inputs, loading, error, setInputs, resetInputs, reload, refreshSpot],
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskState {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk outside DeskProvider");
  return ctx;
}
