"use client";

import { memo, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup } from "framer-motion";
import { Download, Search } from "lucide-react";

import { GhostButton, PrimaryButton, SubPageTabs } from "@/components/layout/app-ui";
import { QuoteLoadProgress } from "@/components/ui/quote-load-progress";
import {
  OBSERVATION_PROGRESS_TABS,
  productHasProgressTab,
  type ObservationProgressTab,
} from "@/lib/active-management/observations";
import { sameAssumedLevels, useMultiDesk, useMultiQuotes, type MultiQuote } from "@/lib/context/multi-desk-provider";
import { INDEX_STRIKE_PRICE_DECIMALS } from "@/lib/engine/vol-surface";
import {
  OBSERVATION_DATE_MODE_LABELS,
  OBSERVATION_DATE_MODES,
  oldestObservationYmd,
  parseObservationDateMode,
  productMatchesObservationRange,
  type ObservationDateMode,
} from "@/lib/multi/observation-date-filter";
import { productKey } from "@/lib/multi/product-key";
import { LIVE_OBSERVATION_TAB_ORDER, productHasObservationTab, type ObservationTabId } from "@/lib/observation-tabs";
import type { ProductMaster } from "@/lib/types";
import { useVirtualWindow } from "@/lib/ui/use-virtual-window";
import { cn, computeGroupedRowSpans, deskTodayISO, formatDeskDate, formatDeskRupees, formatNumber } from "@/lib/utils";
import { PRODUCT_BOOK_HEADERS } from "@/lib/workbook/export-columns";
import { buildProductBookExcelMatrix, buildProductBookMatrix, liveLegsOf, premiumOutflowInWindow } from "@/lib/workbook/product-book-rows";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";

const ROW_HEIGHT = 45;
const HEADERS = PRODUCT_BOOK_HEADERS;

const EXPECTED_IRR_HEADER: (typeof HEADERS)[number] = "Expected Internal Rate of Return at Assumed Level";

const CALC_COLS = new Set([
  "Unwind Quote Amount",
  "Product Internal Rate of Return",
  "Client Internal Rate of Return",
  "Premium Outflow",
  "Residual Internal Rate of Return",
  "Current Internal Rate of Return",
  EXPECTED_IRR_HEADER,
]);

const FACT_COLS = new Set([
  "Face Value",
  "Initial Underlying Level",
  "Contingent Coupon",
  "Inbuilt",
  "Transaction Cost",
  "Issuance Cost",
  "Margin Cost",
  "Tenor",
  "Invested Tenor",
  "Residual Tenor",
  "Product Premium Per Spread",
  "Product Premium Amount",
  "Strike Price",
  "Number of Spreads",
  "Unwind Quantity",
  "Actual Target",
  "Effective Target",
  "Observations Passed",
  "Observations Left",
  "Average So Far",
]);

const OUTFLOW_COLS = new Set(["Unwind Option Price", "Premium Outflow Amount"]);

type ProgressTabId = "all" | ObservationProgressTab;

/** Second tab strip. Filters inside the active observation tab, search and revealed date window. */
const PROGRESS_TAB_ORDER: ReadonlyArray<{ id: ProgressTabId; label: string }> = [
  { id: "all", label: "All Products" },
  ...OBSERVATION_PROGRESS_TABS,
];

type FlatLeg = {
  key: string;
  serial: string;
  product: ProductMaster;
  legIndex: number;
};

function matchesQuery(product: ProductMaster, needle: string): boolean {
  if (!needle) return true;
  return [product.productName, product.productCode, product.formulae]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0 && value !== "-")
    .some((value) => value.toLowerCase().includes(needle));
}

function inProgressTab(product: ProductMaster, tab: ProgressTabId, somePassed: ReadonlySet<ProductMaster>): boolean {
  return tab === "all" || somePassed.has(product) === (tab === "some-passed");
}

function clampDate(value: string, min: string, max: string): string {
  if (!value) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const ProductBookRow = memo(function ProductBookRow({
  values,
  spans,
  displayOnly,
  rowIndex,
  onOpen,
  productKeyValue,
}: {
  values: string[];
  spans: number[];
  displayOnly: boolean;
  rowIndex: number;
  onOpen: (key: string) => void;
  productKeyValue: string;
}) {
  return (
    <tr
      className={cn(rowIndex % 2 === 1 && "data-table-row-alt", displayOnly && "row-display-only", "cursor-pointer")}
      onClick={() => onOpen(productKeyValue)}
    >
      {values.map((value, col) => {
        const span = spans[col] ?? 1;
        if (span === 0) return null;
        const header = HEADERS[col] ?? "";
        const outflow = OUTFLOW_COLS.has(header);
        return (
          <td
            key={`${productKeyValue}-${rowIndex}-${col}`}
            rowSpan={span > 1 ? span : undefined}
            className={cn(
              "align-top",
              col === 0 && "col-pinned col-serial font-semibold",
              col === 1 && "col-pinned-2 font-semibold",
              col <= 2 && "cell-identity",
              CALC_COLS.has(header) && "cell-value-highlight font-bold tabular-nums",
              FACT_COLS.has(header) && "cell-value tabular-nums",
              outflow && displayOnly && "cell-value-display-only tabular-nums",
              outflow && !displayOnly && "cell-value-highlight font-bold tabular-nums",
            )}
          >
            {value}
          </td>
        );
      })}
    </tr>
  );
});

export function MultiProductTable() {
  const router = useRouter();
  const { products, selectProduct, asOfToday } = useMultiDesk();
  const { quotes, quotesLoading, quotesLoaded, quotesTotal, assumedLevels, deskLevels } = useMultiQuotes();
  const deferredQuotes = useDeferredValue(quotes);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [observationTab, setObservationTab] = useState<ObservationTabId>("ongoing");
  const deferredObservationTab = useDeferredValue(observationTab);
  const [progressTab, setProgressTab] = useState<ProgressTabId>("all");
  const deferredProgressTab = useDeferredValue(progressTab);
  const [observationMode, setObservationMode] = useState<ObservationDateMode>("any");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [appliedObservationFilter, setAppliedObservationFilter] = useState<{
    mode: ObservationDateMode;
    start: string;
    end: string;
  } | null>(null);
  const [exporting, setExporting] = useState<"view" | "workbook" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const asOf = asOfToday || deskTodayISO();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const serialByKey = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product, index) => map.set(productKey(product), index + 1));
    return map;
  }, [products]);

  const defaultRangeStart = useMemo(() => oldestObservationYmd(products, asOf), [products, asOf]);
  const maxRangeEnd = asOf;
  const effectiveRangeStart = clampDate(rangeStart || defaultRangeStart, defaultRangeStart, maxRangeEnd);
  const effectiveRangeEnd = clampDate(
    rangeEnd || maxRangeEnd,
    effectiveRangeStart || defaultRangeStart,
    maxRangeEnd,
  );

  const tabProducts = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return products.filter(
      (product) =>
        matchesQuery(product, needle) && productHasObservationTab(product, deferredObservationTab, asOf),
    );
  }, [products, deferredQuery, deferredObservationTab, asOf]);

  const filtered = useMemo(() => {
    if (!appliedObservationFilter) return tabProducts;
    return tabProducts.filter((product) =>
      productMatchesObservationRange(
        product,
        appliedObservationFilter.mode,
        appliedObservationFilter.start,
        appliedObservationFilter.end,
      ),
    );
  }, [tabProducts, appliedObservationFilter]);

  // Progress membership needs dates only. Work it out once per book / as-of, then filter by lookup.
  const somePassed = useMemo(() => {
    const set = new Set<ProductMaster>();
    for (const product of products) {
      if (productHasProgressTab(product, "some-passed", asOf)) set.add(product);
    }
    return set;
  }, [products, asOf]);

  const progressCounts = useMemo((): Record<ProgressTabId, number> => {
    let some = 0;
    for (const product of filtered) if (somePassed.has(product)) some += 1;
    return { all: filtered.length, "none-passed": filtered.length - some, "some-passed": some };
  }, [filtered, somePassed]);

  const shown = useMemo(
    () =>
      deferredProgressTab === "all"
        ? filtered
        : filtered.filter((product) => inProgressTab(product, deferredProgressTab, somePassed)),
    [filtered, somePassed, deferredProgressTab],
  );

  const windowProducts = useMemo(
    () =>
      tabProducts.filter(
        (product) =>
          inProgressTab(product, deferredProgressTab, somePassed) &&
          productMatchesObservationRange(product, observationMode, effectiveRangeStart, effectiveRangeEnd),
      ),
    [tabProducts, deferredProgressTab, somePassed, observationMode, effectiveRangeStart, effectiveRangeEnd],
  );
  const windowOutflow = useMemo(
    () =>
      premiumOutflowInWindow(
        windowProducts,
        (product) => quotes[productKey(product)] ?? null,
        effectiveRangeStart,
        effectiveRangeEnd,
      ),
    [windowProducts, quotes, effectiveRangeStart, effectiveRangeEnd],
  );

  const flat = useMemo(() => {
    const rows: FlatLeg[] = [];
    for (const product of shown) {
      const key = productKey(product);
      const serial = String(serialByKey.get(key) ?? "-");
      const legs = liveLegsOf(product);
      const count = Math.max(legs.length, 1);
      for (let legIndex = 0; legIndex < count; legIndex += 1) {
        rows.push({ key, serial, product, legIndex });
      }
    }
    return rows;
  }, [shown, serialByKey]);

  const { onScroll, start, end } = useVirtualWindow(flat.length, ROW_HEIGHT, scrollerRef, 12);
  const bounds = useMemo(() => {
    const rows = flat.length;
    return {
      start: Math.max(0, Math.min(start, rows)),
      end: Math.max(0, Math.min(end, rows)),
    };
  }, [flat.length, start, end]);

  const visible = useMemo(() => {
    const slice = flat.slice(bounds.start, bounds.end);
    const matrix: string[][] = [];
    const flags: boolean[] = [];
    let cursor = 0;
    while (cursor < slice.length) {
      const head = slice[cursor]!;
      let span = 1;
      while (cursor + span < slice.length && slice[cursor + span]!.key === head.key) span += 1;
      const quote = (deferredQuotes[head.key] ?? null) as MultiQuote | null;
      const built = buildProductBookMatrix({
        serial: Number(head.serial) || 0,
        product: head.product,
        asOf,
        quote,
        expectedPending: quote != null && !sameAssumedLevels(quote.pricedAt, assumedLevels),
      });
      for (let i = 0; i < span; i += 1) {
        const legIndex = slice[cursor + i]!.legIndex;
        matrix.push(built.rows[legIndex] ?? built.rows[0]!);
        flags.push(built.displayOnly[legIndex] ?? false);
      }
      cursor += span;
    }
    return {
      matrix,
      flags,
      spans: computeGroupedRowSpans(
        matrix,
        matrix[0]?.map((_, index) => index) ?? [],
        0,
      ),
    };
  }, [flat, bounds.start, bounds.end, deferredQuotes, asOf, assumedLevels]);

  // A re-quote for new assumed levels keeps the old quotes on screen; export only once all are re-priced.
  function quotesReady(list: ProductMaster[]) {
    return (
      list.length > 0 &&
      list.every((product) => {
        const quote = quotes[productKey(product)];
        return quote != null && sameAssumedLevels(quote.pricedAt, assumedLevels);
      })
    );
  }

  const viewReady = quotesReady(shown);
  const workbookReady = quotesReady(products);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [deferredObservationTab, deferredProgressTab, deferredQuery, appliedObservationFilter]);

  async function downloadExcel(kind: "view" | "workbook") {
    const list = kind === "view" ? shown : products;
    const ready = kind === "view" ? viewReady : workbookReady;
    if (exporting || !ready) return;
    setExporting(kind);
    setExportError(null);
    try {
      preloadExcelExport();
      const { downloadMultiProductBookExcel } = await import("@/lib/workbook/export-screen");
      const tab = LIVE_OBSERVATION_TAB_ORDER.find((item) => item.id === observationTab)?.label ?? "Ongoing";
      const progress =
        deferredProgressTab === "all"
          ? ""
          : (PROGRESS_TAB_ORDER.find((item) => item.id === deferredProgressTab)?.label ?? "");
      const revealed = appliedObservationFilter
        ? `${OBSERVATION_DATE_MODE_LABELS[appliedObservationFilter.mode]} ${formatDeskDate(appliedObservationFilter.start)} to ${formatDeskDate(appliedObservationFilter.end)}`
        : "";
      // Expected Internal Rate of Return is priced at these levels; a blank assumed level is the desk level.
      const levels = [
        `Assumed Nifty Level ${formatNumber(assumedLevels.nifty ?? deskLevels.nifty, INDEX_STRIKE_PRICE_DECIMALS)}`,
        `Assumed Sensex Level ${formatNumber(assumedLevels.sensex ?? deskLevels.sensex, INDEX_STRIKE_PRICE_DECIMALS)}`,
      ].join(" · ");
      const excelRows = list.flatMap((product) => {
        const key = productKey(product);
        return buildProductBookExcelMatrix({
          serial: serialByKey.get(key) ?? 0,
          product,
          asOf,
          quote: quotes[key] ?? null,
        });
      });
      await downloadMultiProductBookExcel([...HEADERS], excelRows, {
        productName: kind === "workbook" ? "All-Ongoing" : ["View", tab, progress].filter(Boolean).join("-"),
        viewNote:
          kind === "workbook"
            ? ["Export Workbook", levels].join(" · ")
            : ["Export View", tab, progress, revealed, levels].filter(Boolean).join(" · "),
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Excel download failed. Try again.");
    } finally {
      setExporting(null);
    }
  }

  function openProduct(key: string) {
    selectProduct(key);
    router.push("/portfolio/unwinding");
  }

  const offsetY = bounds.start * ROW_HEIGHT;
  const bottomGap = Math.max(0, (flat.length - bounds.end) * ROW_HEIGHT);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          <input
            className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
            placeholder="Search name, product code, payoff…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
        </div>
        <GhostButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={exporting != null || !viewReady}
          title={viewReady ? "Download the rows on screen" : "Wait until these quotes finish"}
          onClick={() => void downloadExcel("view")}
        >
          <Download className="h-4 w-4" />
          {exporting === "view" ? "Building…" : viewReady ? "Export View" : "Loading quotes…"}
        </GhostButton>
        <PrimaryButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={exporting != null || !workbookReady}
          title={workbookReady ? "Download every ongoing product" : "Wait until every quote finishes"}
          onClick={() => void downloadExcel("workbook")}
        >
          <Download className="h-4 w-4" />
          {exporting === "workbook" ? "Building…" : workbookReady ? "Export Workbook" : "Loading quotes…"}
        </PrimaryButton>
      </div>

      <div className="mb-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,auto)_auto]">
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor="observation-date-mode">
            Observation Date
          </label>
          <select
            id="observation-date-mode"
            className="select-dark input-glow w-full cursor-pointer appearance-none rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            aria-label="Observation Date"
            value={observationMode}
            onChange={(event) => setObservationMode(parseObservationDateMode(event.target.value))}
          >
            {OBSERVATION_DATE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {OBSERVATION_DATE_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor="observation-start-date">
            Start Date
          </label>
          <input
            id="observation-start-date"
            className="input-glow w-full rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            type="date"
            aria-label="Start Date"
            min={defaultRangeStart}
            max={maxRangeEnd}
            value={effectiveRangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor="observation-end-date">
            End Date
          </label>
          <input
            id="observation-end-date"
            className="input-glow w-full rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            type="date"
            aria-label="End Date"
            min={effectiveRangeStart || defaultRangeStart}
            max={maxRangeEnd}
            value={effectiveRangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <p className="label-chip mb-1">Premium Outflow</p>
          <div
            className="flex h-[3.25rem] items-center rounded-2xl border border-[color:var(--ar-border)] bg-[var(--ar-table-row)] px-4"
            aria-live="polite"
          >
            <span className="text-sm font-bold tabular-nums text-[var(--ar-maroon,#7a1e2c)]">
              {!products.length
                ? "—"
                : windowOutflow.pending
                ? `Pricing ${windowOutflow.priced.toLocaleString("en-IN")} / ${windowOutflow.products.toLocaleString("en-IN")}`
                : formatDeskRupees(windowOutflow.total)}
            </span>
          </div>
        </div>
        <PrimaryButton
          type="button"
          className="h-[3.25rem] px-6"
          onClick={() =>
            setAppliedObservationFilter({
              mode: observationMode,
              start: effectiveRangeStart,
              end: effectiveRangeEnd,
            })
          }
        >
          Reveal
        </PrimaryButton>
      </div>
      <p className="-mt-2 mb-4 text-xs text-muted" aria-live="polite">
        {appliedObservationFilter
          ? `Showing products whose ${OBSERVATION_DATE_MODE_LABELS[appliedObservationFilter.mode]} falls between ${formatDeskDate(appliedObservationFilter.start)} and ${formatDeskDate(appliedObservationFilter.end)}.`
          : `Reveal shows products whose ${OBSERVATION_DATE_MODE_LABELS[observationMode]} falls between the Start Date and End Date.`}{" "}
        Each product&apos;s own dates are in the Observation Start Date and Observation End Date columns.
      </p>

      <QuoteLoadProgress
        active={quotesLoading && quotesTotal > 0}
        loaded={quotesLoaded}
        total={quotesTotal}
      />
      {exportError ? (
        <p className="mb-3 text-xs text-red-700" role="alert">
          {exportError}
        </p>
      ) : null}
      <div className="mb-3">
        <SubPageTabs
          tabs={[...LIVE_OBSERVATION_TAB_ORDER]}
          active={observationTab}
          onSelect={(id) => {
            startTransition(() => setObservationTab(id as ObservationTabId));
          }}
        />
      </div>
      <div className="mb-3">
        {/* Own layout group so this strip's active highlight never animates across from the strip above. */}
        <LayoutGroup id="observation-progress">
          <SubPageTabs
            tabs={PROGRESS_TAB_ORDER.map((tab) => ({
              id: tab.id,
              label: `${tab.label} · ${progressCounts[tab.id].toLocaleString("en-IN")}`,
            }))}
            active={progressTab}
            onSelect={(id) => {
              startTransition(() => setProgressTab(id as ProgressTabId));
            }}
          />
        </LayoutGroup>
      </div>
      <p className="mb-3 text-xs text-muted">
        {shown.length} of {products.length} products. Click a row to open it.
      </p>
      <div ref={scrollerRef} className="desk-table-scroll desk-table-scroll--book" onScroll={onScroll}>
        <table className="data-table-premium data-table-fill text-sm">
          <thead>
            <tr>
              {HEADERS.map((header, index) => (
                <th
                  key={header}
                  title={
                    header === EXPECTED_IRR_HEADER
                      ? "Client Internal Rate of Return at the Assumed Nifty Level or Assumed Sensex Level, capped at Product Internal Rate of Return."
                      : undefined
                  }
                  className={
                    index === 0
                      ? "col-pinned col-serial whitespace-nowrap px-3 py-2 text-left"
                      : index === 1
                        ? "col-pinned-2 whitespace-nowrap px-3 py-2 text-left"
                        : "whitespace-nowrap px-3 py-2 text-left"
                  }
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-muted" colSpan={HEADERS.length}>
                  {products.length === 0
                    ? "Upload the Multiple Products master to load the desk."
                    : filtered.length > 0
                      ? "No products in this tab."
                      : appliedObservationFilter
                        ? "No products have an observation in this date window."
                        : "No products match this search."}
                </td>
              </tr>
            ) : (
              <>
                {offsetY > 0 ? (
                  <tr aria-hidden className="virtual-spacer">
                    <td colSpan={HEADERS.length} style={{ height: offsetY, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
                {visible.matrix.map((values, i) => {
                  const source = flat[bounds.start + i];
                  if (!source) return null;
                  return (
                    <ProductBookRow
                      key={`${source.key}-${source.legIndex}`}
                      values={values}
                      spans={visible.spans[i] ?? []}
                      displayOnly={visible.flags[i] ?? false}
                      rowIndex={bounds.start + i}
                      onOpen={openProduct}
                      productKeyValue={source.key}
                    />
                  );
                })}
                {bottomGap > 0 ? (
                  <tr aria-hidden className="virtual-spacer">
                    <td colSpan={HEADERS.length} style={{ height: bottomGap, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
