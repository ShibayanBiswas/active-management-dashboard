"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Table2 } from "lucide-react";

import { UnwindInputPanel } from "@/components/dashboard/unwind-input-panel";
import {
  AppPage,
  GhostButton,
  Panel,
  PrimaryButton,
  SectionTitle,
} from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { DeskLoadingState } from "@/components/ui/desk-loading";
import { RevealOutput } from "@/components/ui/reveal-output";
import { useDataset } from "@/lib/context/dataset-provider";
import { priceProductBook } from "@/lib/engine/pricer";
import type { PricerRow } from "@/lib/types";
import { computeRowSpans, deskPricingSpot, formatDeskDate, formatNumber, formatPct } from "@/lib/utils";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";
import { PRICER_TABLE_HEADERS } from "@/lib/workbook/export-columns";

const HEADERS = PRICER_TABLE_HEADERS;

function toDisplayRow(r: PricerRow): string[] {
  // Excel IFERROR → 0: never show blank/error for priced cells.
  const n = (v: number, digits: number) => formatNumber(Number.isFinite(v) ? v : 0, digits);
  const p = (v: number) => formatPct(Number.isFinite(v) ? v : 0);
  return [
    n(r.strike, 0),
    formatDeskDate(r.maturity),
    formatDeskDate(r.valuationDate),
    r.optionType,
    n(r.spot, 2),
    p(r.forwardGrowth),
    p(r.discountYield),
    p(r.volatility),
    p(r.volBump),
    p(r.bidOffer),
    n(r.price, 2),
    n(r.sellPrice, 2),
    n(r.buyPrice, 2),
    n(r.delta, 6),
  ];
}

const NUMERIC_COLUMNS = new Set([0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

export function PricerPage() {
  const { inputs, product, surface } = useDataset();
  const [rows, setRows] = useState<PricerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [computing, setComputing] = useState(false);

  const pricingSpot = deskPricingSpot(inputs);
  const productRevision = product
    ? `${product.legs.length}|${product.mobilization}|${product.initialNiftyLevel}|${product.faceValue}`
    : "";
  const surfaceRevision = surface
    ? `${surface.monthKey}|${surface.expiries.length}|${surface.pricingParams?.[0]?.fwdSellRate ?? ""}|${surface.pricingParams?.[0]?.volBump ?? ""}|${surface.referenceUnderlyingPrice ?? ""}|${surface.volsPercent[0]?.[0] ?? ""}|${surface.volsPercent[5]?.[5] ?? ""}`
    : "";
  const resetKey = `${inputs.underlying}|${inputs.unwindDate}|${inputs.debentures}|${inputs.bidAskSpread ?? 0}|${product?.productName ?? ""}|${product?.productCode ?? ""}|${productRevision}|${surfaceRevision}`;

  useEffect(() => {
    preloadExcelExport();
  }, []);

  const computeKey = `${pricingSpot ?? ""}|${inputs.unwindDate}|${inputs.bidAskSpread ?? 0}|${inputs.underlying}|${product?.productName ?? ""}|${product?.productCode ?? ""}|${productRevision}|${surfaceRevision}`;
  const rowsRef = useRef<PricerRow[]>([]);
  rowsRef.current = rows;

  useEffect(() => {
    if (!product || !surface || pricingSpot == null) {
      setRows([]);
      setComputing(false);
      return;
    }

    let cancelled = false;
    if (rowsRef.current.length === 0) setComputing(true);

    try {
      const next = priceProductBook({
        product,
        spot: pricingSpot,
        valuationDate: inputs.unwindDate,
        surface,
        bidAskSpread: inputs.bidAskSpread ?? 0,
        underlying: inputs.underlying === "Sensex" || inputs.underlying === "Nifty" ? inputs.underlying : undefined,
      });
      if (!cancelled) {
        setRows(next);
        setError(null);
        setComputing(false);
      }
    } catch (e) {
      if (!cancelled) {
        setRows([]);
        setError(e instanceof Error ? e.message : "Pricer failed");
        setComputing(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [computeKey, product, surface, pricingSpot, inputs.unwindDate, inputs.bidAskSpread, inputs.underlying]);

  const { matrix, spans } = useMemo(() => {
    const m = rows.map(toDisplayRow);
    return { matrix: m, spans: computeRowSpans(m) };
  }, [rows]);

  async function runExport(kind: "excel" | "pdf") {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      const code = product?.productCode ?? "product";
      if (kind === "excel") {
        const { downloadPricerScreenExcel } = await import("@/lib/workbook/export-screen");
        await downloadPricerScreenExcel(rows, code);
      } else {
        const { downloadPricerScreenPdf } = await import("@/lib/workbook/export-screen");
        await downloadPricerScreenPdf(rows, code);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppPage dense>
      <div className="flex flex-col gap-4">
        <HorizontalBand>
          <UnwindInputPanel />
        </HorizontalBand>

        <HorizontalBand>
          <RevealOutput
            label="Click Here To View Pricer Table"
            resetKey={resetKey}
            footer={
              rows.length ? (
                <div className="flex flex-wrap justify-end gap-3">
                  <PrimaryButton
                    type="button"
                    disabled={exporting}
                    onClick={() => void runExport("excel")}
                  >
                    <Download className="h-4 w-4" />
                    {exporting ? "Building…" : "Download Excel"}
                  </PrimaryButton>
                  <GhostButton
                    type="button"
                    disabled={exporting}
                    onClick={() => void runExport("pdf")}
                  >
                    <FileText className="h-4 w-4" />
                    {exporting ? "Building…" : "Download PDF"}
                  </GhostButton>
                </div>
              ) : null
            }
          >
            <Panel className="min-w-0 overflow-hidden !p-0">
              <div className="border-b border-[color:var(--ar-border)] px-4 py-3">
                <SectionTitle icon={Table2}>Pricer Table</SectionTitle>
              </div>
              {pricingSpot == null && !inputs.underlying ? (
                <DeskLoadingState
                  title="Choose The Underlying"
                  subtitle="Select Nifty or Sensex."
                />
              ) : null}
              {pricingSpot == null && inputs.underlying ? (
                <DeskLoadingState
                  title="Waiting For Index Level"
                  subtitle="Enter or refresh the index level."
                />
              ) : null}
              {error ? <p className="px-4 py-3 text-sm text-red-600">{error}</p> : null}
              {pricingSpot != null && !rows.length && !error ? (
                <DeskLoadingState
                  title="Preparing Pricer Table"
                  subtitle="Loading marks."
                />
              ) : null}
              <div className={rows.length ? "desk-table-scroll max-h-[min(72vh,40rem)]" : "hidden"}>
                <table className="data-table-premium data-table-fill text-sm">
                  <thead>
                    <tr>
                      {HEADERS.map((h, i) => (
                        <th
                          key={h}
                          className={
                            i === 0
                              ? "col-pinned whitespace-nowrap px-3 py-2 text-left"
                              : "whitespace-nowrap px-3 py-2 text-left"
                          }
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, ri) => (
                      <tr key={`${row[0]}-${ri}`} className={ri % 2 ? "data-table-row-alt" : undefined}>
                        {row.map((value, ci) => {
                          const span = spans[ri][ci];
                          if (span === 0) return null;
                          return (
                            <td
                              key={`${ri}-${ci}`}
                              rowSpan={span > 1 ? span : undefined}
                              className={
                                ci === 0
                                  ? "col-pinned px-3 py-2 align-top font-semibold"
                                  : NUMERIC_COLUMNS.has(ci)
                                    ? "cell-value px-3 py-2 tabular-nums align-top"
                                    : "px-3 py-2 align-top"
                              }
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </RevealOutput>
        </HorizontalBand>
      </div>
    </AppPage>
  );
}
