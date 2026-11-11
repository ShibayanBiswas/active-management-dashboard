"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup } from "framer-motion";
import { Download, LineChart } from "lucide-react";

import { GhostButton, PrimaryButton, SubPageTabs } from "@/components/layout/app-ui";
import { BookSearchRow, BookTabStrips, RevealWindowRow, useBookFilters } from "@/components/multi/book-filter-controls";
import { QuoteLoadProgress } from "@/components/ui/quote-load-progress";
import { useBookScenarios } from "@/lib/context/book-scenarios";
import { useMultiDesk } from "@/lib/context/multi-desk-provider";
import { bookViewLabels } from "@/lib/multi/book-filters";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import { useVirtualWindow } from "@/lib/ui/use-virtual-window";
import { cn, deskTodayISO } from "@/lib/utils";
import {
  BOOK_SCENARIO_CENTRE_COL,
  BOOK_SCENARIO_HEADERS,
  BOOK_SCENARIO_IDENTITY_COLS,
  BOOK_SCENARIO_METRICS,
  bookScenarioDisplayRow,
  downloadBookScenarioExcel,
  type BookScenarioMetricId,
} from "@/lib/workbook/book-scenario-export";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";

const ROW_HEIGHT = 45;
const HEADERS = BOOK_SCENARIO_HEADERS;
/** Base Level and the 21 levels are numbers. */
const FIRST_NUMBER_COL = BOOK_SCENARIO_IDENTITY_COLS - 1;
/** The 0 column, shaded with the desk's selected-row tint so it reads down the table. */
const CENTRE_TINT = "!bg-[color:var(--ar-table-row-selected)]";

const ScenarioRow = memo(function ScenarioRow({
  values,
  rowIndex,
  productKeyValue,
  onOpen,
}: {
  values: string[];
  rowIndex: number;
  productKeyValue: string;
  onOpen: (key: string) => void;
}) {
  return (
    <tr className={cn(rowIndex % 2 === 1 && "data-table-row-alt", "cursor-pointer")} onClick={() => onOpen(productKeyValue)}>
      {values.map((value, col) => (
        <td
          key={col}
          className={cn(
            "align-top",
            col === 0 && "col-pinned font-semibold",
            col >= FIRST_NUMBER_COL && col !== BOOK_SCENARIO_CENTRE_COL && "cell-value tabular-nums",
            col === BOOK_SCENARIO_CENTRE_COL && cn("cell-value-highlight tabular-nums", CENTRE_TINT),
          )}
        >
          {value}
        </td>
      ))}
    </tr>
  );
});

/**
 * Every ongoing product repriced at 21 index levels around today's spot, segregated like the
 * Product Book. Priced on request: the rows on screen first, then the rest of the book.
 */
export function BookScenarioTable() {
  const router = useRouter();
  const { products, selectProduct, asOfToday } = useMultiDesk();
  const asOf = asOfToday || deskTodayISO();
  const filters = useBookFilters(products, asOf);
  const { shown, filtered, reveal } = filters;
  const [enabled, setEnabled] = useState(false);
  const [metricId, setMetricId] = useState<BookScenarioMetricId>("unwindQuote");
  const [exporting, setExporting] = useState<"view" | "workbook" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // The products on screen first, so their rows fill before the rest of the book.
  const pricingOrder = useMemo(() => {
    const first = new Set(shown);
    return [...shown, ...products.filter((product) => !first.has(product))];
  }, [shown, products]);
  const scenarios = useBookScenarios({ products: pricingOrder, enabled });
  const rows = useDeferredValue(scenarios.rows);
  const metric = BOOK_SCENARIO_METRICS.find((item) => item.id === metricId) ?? BOOK_SCENARIO_METRICS[0]!;

  const { onScroll, start, end } = useVirtualWindow(shown.length, ROW_HEIGHT, scrollerRef, 12);
  const bounds = {
    start: Math.max(0, Math.min(start, shown.length)),
    end: Math.max(0, Math.min(end, shown.length)),
  };
  const visible = useMemo(
    () =>
      shown.slice(bounds.start, bounds.end).map((product) => {
        const key = productKey(product);
        return { key, values: bookScenarioDisplayRow(product, rows[key], metric) };
      }),
    [shown, bounds.start, bounds.end, rows, metric],
  );

  function rowsReady(list: ProductMaster[]) {
    return enabled && list.length > 0 && list.every((product) => productKey(product) in scenarios.rows);
  }
  const viewReady = rowsReady(shown);
  const workbookReady = rowsReady(products);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [filters.deferredObservationTab, filters.deferredProgressTab, filters.deferredQuery, reveal]);

  async function downloadExcel(kind: "view" | "workbook") {
    const list = kind === "view" ? shown : products;
    const ready = kind === "view" ? viewReady : workbookReady;
    if (exporting || !ready) return;
    setExporting(kind);
    setExportError(null);
    try {
      preloadExcelExport();
      const { tab, progress, revealed } = bookViewLabels(filters.observationTab, filters.deferredProgressTab, reveal);
      await downloadBookScenarioExcel(list, scenarios.rows, {
        fileToken: kind === "workbook" ? "All-Ongoing" : ["View", tab, progress].filter(Boolean).join("-"),
        viewNote: kind === "workbook" ? "Export Workbook" : ["Export View", tab, progress, revealed].filter(Boolean).join(" · "),
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

  if (!enabled) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[16rem] flex-1 text-xs text-muted">
          Every ongoing product priced at 21 index levels, from 1,000 points below today&apos;s spot to 1,000 points
          above in steps of 100, with the same tabs, date window and search as the Product Book. Pricing the whole
          book takes a while, so it loads on request.
        </p>
        <PrimaryButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={!products.length}
          title={products.length ? "Price every ongoing product at each index level" : "Wait until the book loads"}
          onClick={() => setEnabled(true)}
        >
          <LineChart className="h-4 w-4" />
          Load Scenario Table
        </PrimaryButton>
      </div>
    );
  }

  const offsetY = bounds.start * ROW_HEIGHT;
  const bottomGap = Math.max(0, (shown.length - bounds.end) * ROW_HEIGHT);

  return (
    <div>
      <BookSearchRow filters={filters} label="Search scenario products">
        <GhostButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={exporting != null || !viewReady}
          title={viewReady ? "Download the rows on screen, one sheet per figure" : "Wait until these rows finish"}
          onClick={() => void downloadExcel("view")}
        >
          <Download className="h-4 w-4" />
          {exporting === "view" ? "Building…" : viewReady ? "Export View" : "Loading Scenarios…"}
        </GhostButton>
        <PrimaryButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={exporting != null || !workbookReady}
          title={workbookReady ? "Download every ongoing product, one sheet per figure" : "Wait until every row finishes"}
          onClick={() => void downloadExcel("workbook")}
        >
          <Download className="h-4 w-4" />
          {exporting === "workbook" ? "Building…" : workbookReady ? "Export Workbook" : "Loading Scenarios…"}
        </PrimaryButton>
      </BookSearchRow>

      <RevealWindowRow filters={filters} idPrefix="scenario-observation" />

      <QuoteLoadProgress
        active={scenarios.loading && scenarios.total > 0}
        loaded={scenarios.loaded}
        total={scenarios.total}
        title="Loading Scenario Table"
        label="Pricing 21 index levels for every ongoing product, the rows on screen first…"
      />
      {exportError ? (
        <p className="mb-3 text-xs text-red-700" role="alert">
          {exportError}
        </p>
      ) : null}
      <BookTabStrips filters={filters} observationGroup="scenario-observation" progressGroup="scenario-progress" />
      <div className="mb-3">
        <LayoutGroup id="scenario-metric">
          <SubPageTabs
            tabs={BOOK_SCENARIO_METRICS.map((item) => ({ id: item.id, label: item.label }))}
            active={metricId}
            onSelect={(id) => setMetricId(id as BookScenarioMetricId)}
          />
        </LayoutGroup>
      </div>
      <p className="mb-3 text-xs text-muted">
        {shown.length} of {products.length} products. Each column moves the index that many points from the Base Level,
        today&apos;s spot.{metric.change ? " Each change is against the 0 column." : ""} Click a row to open it.
      </p>
      <div ref={scrollerRef} className="desk-table-scroll desk-table-scroll--book" onScroll={onScroll}>
        <table className="data-table-premium data-table-fill text-sm">
          <thead>
            <tr>
              {HEADERS.map((header, index) => (
                <th
                  key={header}
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-left",
                    index === 0 && "col-pinned",
                    // The header's gradient is a background image; clear it so the tint shows.
                    index === BOOK_SCENARIO_CENTRE_COL && cn("!bg-none", CENTRE_TINT),
                  )}
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
                      : reveal
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
                {visible.map((row, i) => (
                  <ScenarioRow
                    key={row.key}
                    values={row.values}
                    rowIndex={bounds.start + i}
                    productKeyValue={row.key}
                    onOpen={openProduct}
                  />
                ))}
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
