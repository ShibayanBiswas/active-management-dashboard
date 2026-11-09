"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Product Book quote fill progress — Dynamic Probability / Gift-style bar
 * with a real completed/total product count (e.g. 20 / 2245).
 */
export function QuoteLoadProgress({
  active,
  loaded,
  total,
  label = "Pricing live unwind quotes for every ongoing product…",
}: {
  active: boolean;
  loaded: number;
  total: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  if (!active || total <= 0) return null;

  const safeLoaded = Math.max(0, Math.min(loaded, total));
  const pct = Math.min(100, Math.max(0, (safeLoaded / total) * 100));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[rgba(212,178,76,0.35)] bg-[color:var(--ar-surface)] shadow-[0_10px_28px_-18px_rgba(122,30,44,0.35)]">
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
          Live Unwind Engine
        </p>
        <h3 className="mt-1 font-serif text-xl text-[color:var(--ar-maroon)]">
          Loading Product Quotes
        </h3>
        <p className="mt-1.5 min-h-[1.25rem] text-sm text-stone-500">{label}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[var(--ar-maroon)] to-[var(--ar-gold)]"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { ease: "linear", duration: 0.18 }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold tabular-nums text-[color:var(--ar-maroon)]">
            {safeLoaded.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")} Products
          </span>
          <span className="tabular-nums text-stone-500">{pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
