"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Server } from "lucide-react";

import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDeskOptional } from "@/lib/context/multi-desk-provider";

function DeskClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning>
      Desk clock {now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
    </span>
  );
}

export function DeskFooter() {
  const { product, surface, loading } = useDataset();
  const multi = useMultiDeskOptional();
  const multiLegs = multi?.products.reduce((sum, item) => sum + item.legs.length, 0) ?? 0;
  const legs = multi && multi.products.length > 0 ? multiLegs : product?.legs.length ?? 0;
  const bookLoading = multi ? multi.products.length === 0 && loading : loading;
  const status = bookLoading
    ? "Opening The Desk Book"
    : multi && multi.products.length > 0 && surface
      ? `Live Book · ${multi.products.length} Products · ${surface.label}`
      : product && surface
        ? `Live Book · ${product.productName} · ${surface.label}`
        : "Upload Volatility Surface and Product Master to replace the active desk book.";

  return (
    <footer className="relative z-10 mt-8 border-t border-stone-200 bg-white/90 font-ui backdrop-blur-xl dark:border-[color:var(--ar-border)] dark:bg-[color-mix(in_srgb,var(--ar-surface)_92%,transparent)]">
      <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px] text-stone-500 dark:text-stone-400 lg:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-gold" />
            Anand Rathi Wealth · Active Management Dashboard
          </span>
          <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
            <Database className="h-3.5 w-3.5 text-gold-light" />
            {bookLoading ? "Opening Book" : `${legs} Option Legs`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
            <DeskClock />
          </span>
        </div>
        <p
          className="max-w-xl truncate text-right italic text-stone-500 dark:text-stone-400"
          title={status}
          suppressHydrationWarning
        >
          {status}
        </p>
      </div>
    </footer>
  );
}
