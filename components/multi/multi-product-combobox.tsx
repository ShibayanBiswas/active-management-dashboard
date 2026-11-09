"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Hash, Search } from "lucide-react";

import { productKey } from "@/lib/multi/product-key";
import { productHasLiveMaturity } from "@/lib/observation-tabs";
import type { ProductMaster } from "@/lib/types";
import { cn, deskTodayISO } from "@/lib/utils";

type MenuRect = { left: number; top: number; width: number };

export function MultiProductCombobox({
  products,
  selectedKey,
  onSelect,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: {
  products: ProductMaster[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) setInternalOpen(next);
    },
    [controlledOpen, onOpenChange],
  );
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const liveProducts = useMemo(
    () => products.filter((item) => productHasLiveMaturity(item, deskTodayISO())),
    [products],
  );

  const selected = useMemo(
    () => liveProducts.find((item) => productKey(item) === selectedKey) ?? liveProducts[0] ?? null,
    [liveProducts, selectedKey],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return liveProducts;
    return liveProducts.filter((item) =>
      [item.productName, item.productCode, item.formulae]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [liveProducts, query]);

  const updateRect = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setRect({ left: box.left, top: box.bottom + 8, width: box.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-combobox-menu]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, setOpen]);

  return (
    <div className="relative min-w-0 w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className="input-glow btn-animated flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-gold/40 hover:shadow-[0_0_16px_rgba(212,178,76,0.12)] dark:hover:border-gold/20 dark:hover:shadow-none"
        onClick={() => setOpen(!open)}
      >
        <Search className="h-4 w-4 shrink-0 text-amber-900" />
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <p className="truncate text-sm font-semibold text-ink">{selected.productName}</p>
              <p className="truncate text-xs text-muted">{selected.productCode}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Search name, product code…</p>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted transition", open && "rotate-180")} />
      </button>

      {mounted && rect
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  data-combobox-menu
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="dropdown-panel fixed z-[200] overflow-hidden"
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 320) }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="border-b border-stone-200 p-3 dark:border-[color:var(--ar-border)]">
                    <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-[color:var(--ar-panel)]">
                      <Search className="h-4 w-4 text-gold-dark" />
                      <input
                        autoFocus
                        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                        placeholder="Type name or product code…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {filtered.length.toLocaleString("en-IN")} products
                    </p>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted">No products match “{query}”.</p>
                  ) : (
                    <div className="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain">
                      {filtered.map((product) => {
                        const key = productKey(product);
                        const active = key === selectedKey;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={cn(
                              "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-gold/10 hover:pl-5",
                              active && "bg-gold/15",
                            )}
                            onClick={() => {
                              onSelect(key);
                              setOpen(false);
                              setQuery("");
                            }}
                          >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{product.productName}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                                <Hash className="h-3 w-3" />
                                {product.productCode}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
