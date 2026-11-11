"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { GhostButton, PrimaryButton, SpecRail } from "@/components/layout/app-ui";
import { BookSearchRow, BookTabStrips, RevealWindowRow, useBookFilters } from "@/components/multi/book-filter-controls";
import { QuoteLoadProgress } from "@/components/ui/quote-load-progress";
import { sameAssumedLevels, useMultiDesk, useMultiQuotes, type MultiQuote } from "@/lib/context/multi-desk-provider";
import { INDEX_STRIKE_PRICE_DECIMALS } from "@/lib/engine/vol-surface";
import { bookViewLabels, inProgressTab } from "@/lib/multi/book-filters";
import { productMatchesObservationRange } from "@/lib/multi/observation-date-filter";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import { useVirtualWindow } from "@/lib/ui/use-virtual-window";
import { cn, computeGroupedRowSpans, deskTodayISO, formatDeskRupees, formatNumber, roundDeskMoney } from "@/lib/utils";
import { PRODUCT_BOOK_HEADERS } from "@/lib/workbook/export-columns";
import { buildProductBookExcelMatrix, buildProductBookMatrix, liveLegsOf, premiumOutflowInWindow } from "@/lib/workbook/product-book-rows";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";

const ROW_HEIGHT = 45;
const HEADERS = PRODUCT_BOOK_HEADERS;

const CALC_COLS = new Set([
  "Unwind Quote Amount",
  "Product Internal Rate of Return",
  "Client Internal Rate of Return",
  "Premium Outflow",
  "Residual Internal Rate of Return",
  "Current Internal Rate of Return",
  "Expected Internal Rate of Return",
  "Expected Difference",
  "Exit Value",
]);

/** Header tooltips for the Active Management figures priced off the expected level. */
const HEADER_TITLES: Partial<Record<(typeof HEADERS)[number], string>> = {
  "Expected Internal Rate of Return":
    "Client Internal Rate of Return at today's spot, or at the Spot Level edited on the Unwinding Calculator, capped at Product Internal Rate of Return.",
  "Expected Difference": "The difference expected at maturity, at today's spot or the Spot Level edited on the Unwinding Calculator.",
  "Exit Value": "The book unwind value at today's spot.",
};

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
  "Mobilization",
  "Actual Target",
  "Effective Target",
  "Observations Passed",
  "Observations Left",
  "Average So Far",
]);

const OUTFLOW_COLS = new Set(["Unwind Option Price", "Premium Outflow Amount"]);

type FlatLeg = {
  key: string;
  serial: string;
  product: ProductMaster;
  legIndex: number;
};

/** "…" while any product's quote is pending (or, for Expected Difference, priced at other levels). */
type BookTotal = number | "pending" | null;

/** Sum of the finite values, one per product, as the workbook totals do. Null when none is finite. */
function bookTotal(values: Array<number | null | undefined>, pending: boolean): BookTotal {
  if (pending) return "pending";
  let total = 0;
  let any = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    any = true;
  }
  return any ? roundDeskMoney(total) : null;
}

function totalText(value: BookTotal): string {
  return value === "pending" ? "…" : formatDeskRupees(value);
}

/** Expected Internal Rate of Return and Expected Difference are priced at these; null is today's spot. */
function expectedLevelText(level: number | null): string {
  return level == null ? "Today's Spot" : formatNumber(level, INDEX_STRIKE_PRICE_DECIMALS);
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
  const { quotes, quotesLoading, quotesLoaded, quotesTotal, expectedLevels } = useMultiQuotes();
  const deferredQuotes = useDeferredValue(quotes);
  const asOf = asOfToday || deskTodayISO();
  const filters = useBookFilters(products, asOf);
  const { tabProducts, filtered, somePassed, shown, deferredProgressTab, reveal } = filters;
  const [exporting, setExporting] = useState<"view" | "workbook" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const serialByKey = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product, index) => map.set(productKey(product), index + 1));
    return map;
  }, [products]);

  const windowProducts = useMemo(
    () =>
      tabProducts.filter(
        (product) =>
          inProgressTab(product, deferredProgressTab, somePassed) &&
          productMatchesObservationRange(product, filters.observationMode, filters.rangeStart, filters.rangeEnd),
      ),
    [tabProducts, deferredProgressTab, somePassed, filters.observationMode, filters.rangeStart, filters.rangeEnd],
  );
  const windowOutflow = useMemo(
    () =>
      premiumOutflowInWindow(
        windowProducts,
        (product) => quotes[productKey(product)] ?? null,
        filters.rangeStart,
        filters.rangeEnd,
      ),
    [windowProducts, quotes, filters.rangeStart, filters.rangeEnd],
  );

  // Workbook totals for the products on screen, one value per product.
  const totals = useMemo(() => {
    const seen = new Set<string>();
    const mobilization: number[] = [];
    const exitValues: Array<number | null | undefined> = [];
    const differences: Array<number | null | undefined> = [];
    let quotePending = false;
    let expectedPending = false;
    for (const product of shown) {
      const key = productKey(product);
      if (seen.has(key)) continue;
      seen.add(key);
      mobilization.push(product.mobilization);
      const quote = quotes[key];
      if (quote == null) {
        quotePending = true;
        continue;
      }
      if (!sameAssumedLevels(quote.pricedAt, expectedLevels)) expectedPending = true;
      exitValues.push(quote.am?.exitValueRs);
      differences.push(quote.am?.expectedDifferenceRs);
    }
    return {
      mobilization: bookTotal(mobilization, false),
      exitValue: bookTotal(exitValues, quotePending),
      expectedDifference: bookTotal(differences, quotePending || expectedPending),
    };
  }, [shown, quotes, expectedLevels]);

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
        expectedPending: quote != null && !sameAssumedLevels(quote.pricedAt, expectedLevels),
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
  }, [flat, bounds.start, bounds.end, deferredQuotes, asOf, expectedLevels]);

  // A re-quote for new expected levels keeps the old quotes on screen; export only once all are re-priced.
  function quotesReady(list: ProductMaster[]) {
    return (
      list.length > 0 &&
      list.every((product) => {
        const quote = quotes[productKey(product)];
        return quote != null && sameAssumedLevels(quote.pricedAt, expectedLevels);
      })
    );
  }

  const viewReady = quotesReady(shown);
  const workbookReady = quotesReady(products);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [filters.deferredObservationTab, deferredProgressTab, filters.deferredQuery, reveal]);

  async function downloadExcel(kind: "view" | "workbook") {
    const list = kind === "view" ? shown : products;
    const ready = kind === "view" ? viewReady : workbookReady;
    if (exporting || !ready) return;
    setExporting(kind);
    setExportError(null);
    try {
      preloadExcelExport();
      const { downloadMultiProductBookExcel } = await import("@/lib/workbook/export-screen");
      const { tab, progress, revealed } = bookViewLabels(filters.observationTab, deferredProgressTab, reveal);
      const levels = [
        `Expected Nifty Level ${expectedLevelText(expectedLevels.nifty)}`,
        `Expected Sensex Level ${expectedLevelText(expectedLevels.sensex)}`,
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
      <BookSearchRow filters={filters} label="Search products">
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
      </BookSearchRow>

      <RevealWindowRow
        filters={filters}
        idPrefix="observation"
        note="Each product's own dates are in the Observation Start Date and Observation End Date columns."
        extra={
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
        }
      />

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
      <BookTabStrips filters={filters} progressGroup="observation-progress" />
      <SpecRail
        className="mb-3"
        cards={[
          { label: "Total Mobilization", value: totalText(totals.mobilization) },
          { label: "Total Exit Value", value: totalText(totals.exitValue) },
          { label: "Total Expected Difference", value: totalText(totals.expectedDifference) },
        ]}
      />
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
                  title={HEADER_TITLES[header]}
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
