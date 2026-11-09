"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";

import { GhostButton } from "@/components/layout/app-ui";
import { useMultiDesk, useMultiQuotes } from "@/lib/context/multi-desk-provider";
import { allOptionExpiriesPassed, postObservationDisplayRow, postObservationExcelRow } from "@/lib/multi/post-observation";
import { productKey } from "@/lib/multi/product-key";
import type { ProductMaster } from "@/lib/types";
import { cn, computeGroupedRowSpans } from "@/lib/utils";
import { POST_OBSERVATION_HEADERS } from "@/lib/workbook/export-columns";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";
import { useVirtualWindow } from "@/lib/ui/use-virtual-window";

const ROW_HEIGHT = 45;

const RUPEE_COLS = new Set([
  "Unwind Quote Amount",
  "Initial Price Per Debenture",
  "Expected Maturity Quote",
  "Net Mobilisation",
  "Expected Amount",
  "Unwind Amount",
  "Total Funds For Margin",
  "Amount with NBFC Rupees",
  "NBFC Grown Value Rupees",
  "Premium Credited",
  "Premium Grown Value Rupees",
  "Premium Outflow",
  "Difference",
]);

function matchesQuery(product: ProductMaster, needle: string): boolean {
  if (!needle) return true;
  return [product.productName, product.productCode, product.formulae]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0 && value !== "-")
    .some((value) => value.toLowerCase().includes(needle));
}

export function PostObservationTable() {
  const router = useRouter();
  const { products, asOfToday, selectProduct } = useMultiDesk();
  const { quotes } = useMultiQuotes();
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    return products
      .filter((product) => allOptionExpiriesPassed(product, asOfToday))
      .filter((product) => matchesQuery(product, needle))
      .map((product, index) => ({
        product,
        key: productKey(product),
        serial: index + 1,
      }));
  }, [products, asOfToday, needle]);

  const ready = rows.length > 0 && rows.every((row) => quotes[row.key] != null);
  const virtual = useVirtualWindow(rows.length, ROW_HEIGHT, scrollerRef, 8);
  const visible = rows.slice(virtual.start, virtual.end);
  const shown = useMemo(() => {
    const matrix = visible.map((row) => postObservationDisplayRow(row.serial, row.product, quotes[row.key] ?? null));
    return {
      matrix,
      spans: computeGroupedRowSpans(
        matrix,
        matrix[0]?.map((_, index) => index) ?? [],
        0,
      ),
    };
  }, [visible, quotes]);
  const offsetY = virtual.start * ROW_HEIGHT;
  const bottomGap = Math.max(0, (rows.length - virtual.end) * ROW_HEIGHT);

  async function downloadExcel() {
    if (exporting || !ready) return;
    setExporting(true);
    setExportError(null);
    try {
      preloadExcelExport();
      const { downloadMultiProductBookExcel } = await import("@/lib/workbook/export-screen");
      await downloadMultiProductBookExcel(
        [...POST_OBSERVATION_HEADERS],
        rows.map((row) => postObservationExcelRow(row.serial, row.product, quotes[row.key] ?? null)),
        {
          productName: "Post-Observation",
          viewNote: "Post Observation Analytics",
          title: "Post Observation Analytics",
          sheetName: "Post Observation",
        },
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Excel download failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          <input
            className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
            placeholder="Search name, product code, payoff…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search post observation products"
          />
        </div>
        <GhostButton
          type="button"
          className="!px-5 !py-2.5 shrink-0"
          disabled={exporting || !ready}
          title={ready ? "Download Post Observation Analytics" : "Wait until these quotes finish"}
          onClick={() => void downloadExcel()}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Building…" : ready ? "Export Excel" : "Loading quotes…"}
        </GhostButton>
      </div>
      <p className="mb-3 text-xs text-muted">
        {rows.length} {rows.length === 1 ? "product" : "products"} with every option expiry on or before today. Click a row to open it.
      </p>
      {exportError ? (
        <p className="mb-3 text-xs text-red-700" role="alert">
          {exportError}
        </p>
      ) : null}
      <div ref={scrollerRef} className="desk-table-scroll desk-table-scroll--book" onScroll={virtual.onScroll}>
        <table className="data-table-premium data-table-fill text-sm">
          <thead>
            <tr>
              {POST_OBSERVATION_HEADERS.map((header, index) => (
                <th
                  key={header}
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
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-muted" colSpan={POST_OBSERVATION_HEADERS.length}>
                  No product has every option expiry behind today.
                </td>
              </tr>
            ) : (
              <>
                {offsetY > 0 ? (
                  <tr aria-hidden className="virtual-spacer">
                    <td colSpan={POST_OBSERVATION_HEADERS.length} style={{ height: offsetY, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
                {visible.map((row, visibleIndex) => {
                const values = shown.matrix[visibleIndex] ?? [];
                const spans = shown.spans[visibleIndex] ?? [];
                return (
                  <tr
                    key={row.key}
                    className={cn((virtual.start + visibleIndex) % 2 === 1 && "data-table-row-alt", "cursor-pointer")}
                    onClick={() => {
                      selectProduct(row.key);
                      router.push("/portfolio/unwinding");
                    }}
                  >
                    {values.map((value, index) => {
                      const span = spans[index] ?? 1;
                      if (span === 0) return null;
                      const header = POST_OBSERVATION_HEADERS[index] ?? "";
                      return (
                        <td
                          key={header}
                          rowSpan={span > 1 ? span : undefined}
                          className={cn(
                            "align-top",
                            RUPEE_COLS.has(header) && "cell-value-highlight font-bold tabular-nums",
                            index === 0 && "col-pinned col-serial font-semibold",
                            index === 1 && "col-pinned-2 font-semibold",
                          )}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
                {bottomGap > 0 ? (
                  <tr aria-hidden className="virtual-spacer">
                    <td colSpan={POST_OBSERVATION_HEADERS.length} style={{ height: bottomGap, padding: 0, border: 0 }} />
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
