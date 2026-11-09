"use client";

import { createContext, useContext } from "react";

import type { ProductMaster, UnwindInputs, VolSurface } from "@/lib/types";

export type DatasetContextValue = {
  product: ProductMaster | null;
  surface: VolSurface | null;
  loading: boolean;
  inputs: UnwindInputs;
  setInputs: (patch: Partial<UnwindInputs>) => void;
  refresh: () => Promise<void>;
  applyBook: (next: { product?: ProductMaster; surface?: VolSurface; products?: ProductMaster[] }) => void;
  saveProduct: (next: ProductMaster) => Promise<{ persisted: boolean }>;
  saveSurface: (next: VolSurface) => Promise<{ persisted: boolean }>;
};

/** Provided by MultiDatasetProvider: the selected product, the surface and the desk inputs. */
export const DatasetContext = createContext<DatasetContextValue | null>(null);

export function useDataset() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset requires MultiDatasetProvider");
  return ctx;
}
