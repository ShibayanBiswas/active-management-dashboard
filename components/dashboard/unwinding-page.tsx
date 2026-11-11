"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  Download,
  FileText,
  Landmark,
  Percent,
  Table2,
} from "lucide-react";

import { ActiveManagementTab } from "@/components/active-management/active-management-tab";
import { CardGrid, type UnwindBasis } from "@/components/active-management/am-table";
import { ProductPricerTab } from "@/components/active-management/product-pricer-tab";
import { scenarioGridFor } from "@/components/active-management/scenario-grid-runner";
import { ScenarioGridTab } from "@/components/active-management/scenario-grid-tab";
import { UnwindInputPanel } from "@/components/dashboard/unwind-input-panel";
import {
  AppPage,
  GhostButton,
  Panel,
  PrimaryButton,
  SectionTitle,
  SubPageTabs,
} from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { DeskLoadingState } from "@/components/ui/desk-loading";
import { RevealOutput } from "@/components/ui/reveal-output";
import { cn } from "@/lib/cn";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiQuotes } from "@/lib/context/multi-desk-provider";
import { collectExpiredLegExpiryDates } from "@/lib/engine/expiry-spots";
import { computeUnwind } from "@/lib/engine/unwind";
import { productKey } from "@/lib/multi/product-key";
import type { OptionTableRow, UnwindResult } from "@/lib/types";
import {
  capAtProductIrr,
  computeGroupedRowSpans,
  deskBlank,
  deskPricingSpot,
  formatDeskDate,
  formatDeskRupees,
  formatNumber,
  formatPct,
} from "@/lib/utils";
import {
  activeManagementTab,
  productPricerTab,
  scenarioGridTab,
  type AmExportDoc,
} from "@/lib/workbook/am-export-columns";
import { OPTION_BOOK_HEADERS } from "@/lib/workbook/export-columns";
import { unwindProductFactRows } from "@/lib/workbook/product-facts";
import { preloadExcelExport } from "@/lib/workbook/excel-runtime";
import { OPTION_BOOK_MERGE_COLS } from "@/lib/workbook/table-merge";

const TABS = [
  { id: "quotes", label: "Unwind Quote and Returns" },
  { id: "facts", label: "Product Facts" },
  { id: "funding", label: "NBFC MIS" },
  { id: "rupees", label: "NBFC Book Values" },
  { id: "options", label: "Options Book" },
  { id: "active", label: "Active Management" },
  { id: "pricer", label: "Pricer Table" },
  { id: "scenario", label: "Scenario Grid" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** A tab named in the address, as in /portfolio/unwinding?tab=pricer from the Logic Atlas. */
function tabFromAddress(): TabId | null {
  const asked = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((t) => t.id === asked)?.id ?? null;
}

function formatRs(v: number | null | undefined): string {
  return formatDeskRupees(v);
}

/* Group-merged trade identity columns on the left, per-leg live marks on the right. */
const OPTION_HEADERS = OPTION_BOOK_HEADERS;

const OPTION_NUMERIC_COLUMNS = new Set([1, 2, 5, 7, 8, 9, 10]);
/** Unwind Option Price + Premium Outflow Amount — KPI path vs display-only. */
const OPTION_OUTFLOW_COLUMNS = new Set([9, 10]);

/**
 * Display-only (faint): expired options that finish out of the money.
 * Counted (bold maroon): live marks and expired intrinsic, sell or buy.
 */
function isDisplayOnlyOutflow(r: OptionTableRow): boolean {
  return r.expired && Math.abs(r.unwindPrice) === 0;
}

function toOptionDisplayRow(r: OptionTableRow): string[] {
  const countedExpired = r.expired && Math.abs(r.unwindPrice) > 0;
  const unwindDisplay = countedExpired ? r.unwindPrice : Math.abs(r.unwindPrice);
  return [
    deskBlank(r.options),
    formatNumber(r.strike, 0),
    formatNumber(r.spreads, 2),
    deskBlank(r.original),
    deskBlank(r.unwind),
    formatNumber(r.quantity, 2),
    formatDeskDate(r.expiry),
    r.premiumPerSpread == null ? "-" : formatNumber(r.premiumPerSpread, 2),
    formatRs(r.prdPremium),
    formatNumber(unwindDisplay, 2),
    formatRs(r.premiumOutflowRs),
  ];
}

export function UnwindingPage() {
  const { inputs, product, surface, refresh } = useDataset();
  const { quotes, deskLevels } = useMultiQuotes();
  const [result, setResult] = useState<UnwindResult | null>(null);
  /** What `result` was priced on, expiry closes included — the Active Management tabs reuse it. */
  const [basis, setBasis] = useState<UnwindBasis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("quotes");
  const [computing, setComputing] = useState(false);
  /** Button text while a download builds; null when idle. */
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exporting = exportStatus != null;

  useEffect(() => {
    const asked = tabFromAddress();
    if (asked) setTab(asked);
  }, []);

  /**
   * The Active Management, Pricer Table and Scenario Grid downloads for the unwind on screen,
   * as their tabs build them. A grid not yet priced is priced here, level by level.
   */
  async function activeManagementDocs(on: UnwindBasis): Promise<AmExportDoc[]> {
    const am = quotes[productKey(on.product)]?.am ?? null;
    const active = activeManagementTab({
      ...on,
      actualTarget: am?.actualTarget ?? null,
      actualTargetSource: am?.actualTargetSource ?? null,
      deskLevels,
    });
    const pricer = productPricerTab(on);
    const grid = await scenarioGridFor(on, {
      onLevel: (done, total) => setExportStatus(`Pricing Scenario Grid ${Math.min(done + 1, total)} Of ${total}…`),
    });
    setExportStatus("Building…");
    return [active.doc, pricer.doc, ...(grid ? [scenarioGridTab(grid).doc] : [])];
  }

  async function runExport(kind: "excel" | "pdf" | "options-pdf") {
    if (!result || !basis || exporting) return;
    const on = basis;
    setExportStatus("Building…");
    try {
      if (kind === "excel") {
        const tabs = await activeManagementDocs(on);
        const { downloadUnwindScreenExcel } = await import("@/lib/workbook/export-screen");
        await downloadUnwindScreenExcel(on.result, tabs);
      } else if (kind === "options-pdf") {
        const { downloadOptionsBookPdf } = await import("@/lib/workbook/export-screen");
        await downloadOptionsBookPdf(on.result);
      } else {
        const tabs = await activeManagementDocs(on);
        const { downloadUnwindScreenPdf } = await import("@/lib/workbook/export-screen");
        await downloadUnwindScreenPdf(on.result, tabs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportStatus(null);
    }
  }

  const pricingSpot = deskPricingSpot(inputs);
  const productRevision = product
    ? `${product.legs.length}|${product.mobilization}|${product.initialNiftyLevel}|${product.faceValue}`
    : "";
  const surfaceRevision = surface
    ? `${surface.monthKey}|${surface.expiries.length}|${surface.pricingParams?.[0]?.fwdSellRate ?? ""}|${surface.pricingParams?.[0]?.volBump ?? ""}|${surface.referenceUnderlyingPrice ?? ""}|${surface.volsPercent[0]?.[0] ?? ""}|${surface.volsPercent[5]?.[5] ?? ""}`
    : "";
  // Blank spread (the Bid Ask table) and 0 (no spread) price differently, so they key differently.
  const spreadKey = inputs.bidAskSpread ?? "table";
  const resetKey = `${inputs.underlying}|${inputs.unwindDate}|${inputs.debentures}|${spreadKey}|${product?.productName ?? ""}|${product?.productCode ?? ""}|${productRevision}|${surfaceRevision}`;

  useEffect(() => {
    preloadExcelExport();
    void refresh();
  }, [refresh]);

  // Primitive key — avoid re-running on every new `inputs` object identity from context.
  const computeKey = `${pricingSpot ?? ""}|${inputs.unwindDate}|${inputs.debentures}|${spreadKey}|${inputs.underlying}|${product?.productName ?? ""}|${product?.productCode ?? ""}|${productRevision}|${surfaceRevision}`;
  const resultRef = useRef<UnwindResult | null>(null);
  resultRef.current = result;

  useEffect(() => {
    if (!product || !surface || pricingSpot == null || !inputs.debentures) {
      setResult(null);
      setBasis(null);
      setComputing(false);
      return;
    }

    let cancelled = false;
    // Cold start only — keep prior marks visible while quietly repricing (no flicker).
    if (resultRef.current == null) setComputing(true);
    setError(null);

    void (async () => {
      try {
        const expiryDates = collectExpiredLegExpiryDates(product, inputs.unwindDate);
        let expirySpots: Record<string, number> = {};
        if (expiryDates.length > 0) {
          const res = await fetch("/api/market/expiry-spots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dates: expiryDates, underlying: inputs.underlying || "Nifty" }),
            cache: "no-store",
          });
          if (!res.ok) {
            throw new Error("Yahoo expiry spots unavailable — cannot mark expired options");
          }
          const data = (await res.json()) as { spots?: Record<string, number> };
          expirySpots = data.spots ?? {};
          for (const iso of expiryDates) {
            if (!(expirySpots[iso] != null && expirySpots[iso]! > 0)) {
              throw new Error(`Yahoo expiry spot missing for ${iso}`);
            }
          }
        }
        const pricedInputs = {
          ...inputs,
          spot: pricingSpot,
          expirySpots,
        };
        const next = computeUnwind({
          product,
          surface,
          inputs: pricedInputs,
        });
        if (!cancelled) {
          setResult(next);
          setBasis({ product, surface, inputs: pricedInputs, result: next });
          setComputing(false);
        }
      } catch (e) {
        if (!cancelled) {
          setResult(null);
          setBasis(null);
          setError(e instanceof Error ? e.message : "Unwind failed");
          setComputing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // computeKey encodes the input primitives that affect marks.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid inputs object identity churn
  }, [computeKey, product, surface, pricingSpot]);

  const { optionMatrix, optionSpans, outflowFlags } = useMemo(() => {
    const rows = result?.optionRows ?? [];
    const m = rows.map(toOptionDisplayRow);
    return {
      optionMatrix: m,
      optionSpans: computeGroupedRowSpans(m, [...OPTION_BOOK_MERGE_COLS], 1),
      outflowFlags: rows.map(isDisplayOnlyOutflow),
    };
  }, [result]);

  return (
    <AppPage dense>
      <div className="flex flex-col gap-4">
        <HorizontalBand>
          <UnwindInputPanel />
        </HorizontalBand>

        {error ? <Panel className="border-red-300 text-sm text-red-700">{error}</Panel> : null}

        <HorizontalBand>
          <RevealOutput
            label="Click Here To View Unwinding Output"
            resetKey={resetKey}
            footer={
              result ? (
                <div className="flex flex-wrap justify-end gap-3">
                  <PrimaryButton
                    type="button"
                    disabled={exporting || computing || !result}
                    title={
                      computing || !result
                        ? "Wait until unwind marks finish loading"
                        : "Download Unwinding Summary, Options Book, Active Management, Pricer Table and Scenario Grid Excel"
                    }
                    onClick={() => void runExport("excel")}
                  >
                    <Download className="h-4 w-4" />
                    {exportStatus ?? "Download Excel"}
                  </PrimaryButton>
                  <GhostButton
                    type="button"
                    disabled={exporting || computing || !result}
                    title={
                      computing || !result
                        ? "Wait until unwind marks finish loading"
                        : "Download Unwinding Summary, Active Management, Pricer Table and Scenario Grid PDF"
                    }
                    onClick={() => void runExport("pdf")}
                  >
                    <FileText className="h-4 w-4" />
                    {exportStatus ?? "Download PDF"}
                  </GhostButton>
                </div>
              ) : null
            }
          >
            {!result ? (
              <Panel className="overflow-hidden">
                {pricingSpot == null && !inputs.underlying ? (
                  <DeskLoadingState
                    title="Choose The Underlying"
                    subtitle="Choose Nifty or Sensex."
                  />
                ) : pricingSpot == null ? (
                  <DeskLoadingState
                    title="Waiting For Index Level"
                    subtitle="Waiting for the index level. You can type one."
                  />
                ) : (
                  <DeskLoadingState
                    title="Preparing Unwind Marks"
                    subtitle="Preparing the unwind."
                  />
                )}
              </Panel>
            ) : (              <>
                <HorizontalBand>
                  <SubPageTabs tabs={[...TABS]} active={tab} onSelect={(id) => setTab(id as TabId)} />
                </HorizontalBand>

                {tab === "quotes" ? (
                  <Panel>
                    <SectionTitle icon={Percent}>Unwind Quote and Internal Rates of Return</SectionTitle>
                    <CardGrid
                      className="mt-1"
                      cards={[
                        { label: "Unwind Quote Percent", value: formatPct(result.unwindQuotePct) },
                        { label: "Unwind Quote Amount", value: formatRs(result.unwindQuoteRs) },
                        { label: "Product Internal Rate of Return", value: formatPct(result.productIRR) },
                        { label: "Client Internal Rate of Return", value: formatPct(capAtProductIrr(result.clientIRR, result.productIRR)) },
                        { label: "Residual Internal Rate of Return", value: formatPct(capAtProductIrr(result.residualIRR, result.productIRR)) },
                      ]}
                    />
                  </Panel>
                ) : null}

                {tab === "facts" ? (
                  <Panel>
                    <SectionTitle icon={Calculator}>Product Facts</SectionTitle>
                    <CardGrid
                      className="mt-1"
                      cards={unwindProductFactRows(result).map(([label, value]) => ({ label, value }))}
                    />
                  </Panel>
                ) : null}

                {tab === "funding" ? (
                  <Panel>
                    <SectionTitle icon={Landmark}>NBFC MIS</SectionTitle>
                    <CardGrid
                      className="mt-1"
                      cards={[
                        { label: "Total Debentures in Issue", value: formatNumber(result.totalDebs, 0) },
                        { label: "Amount with NBFC Percent", value: formatPct(result.amountWithNbfc) },
                        { label: "NBFC Grown Value Percent", value: formatPct(result.nbfcGrownValue) },
                        { label: "Premium Credited Percent", value: formatPct(result.premium) },
                        { label: "Premium Grown Value Percent", value: formatPct(result.premiumGrownValue) },
                        {
                          label: "Current Premium Outflow Percent",
                          value: formatPct(result.currentPremOutflowPct),
                        },
                      ]}
                    />
                  </Panel>
                ) : null}

                {tab === "rupees" ? (
                  <Panel>
                    <SectionTitle icon={Banknote}>NBFC Book Values</SectionTitle>
                    <CardGrid
                      className="mt-1"
                      cards={[
                        {
                          label: "Amount with NBFC Rupees",
                          value: formatRs(result.masterEconomics.amtWithNbfcRs),
                        },
                        {
                          label: "NBFC Grown Value Rupees",
                          value: formatRs(result.masterEconomics.grownValueRs),
                        },
                        {
                          label: "Premium Credited",
                          value: formatRs(result.masterEconomics.premiumCreditedRs),
                        },
                        {
                          label: "Premium Grown Value Rupees",
                          value: formatRs(result.masterEconomics.premGrownValueRs),
                        },
                        {
                          label: "Premium Outflow",
                          value: formatRs(result.masterEconomics.premiumOutflowRs),
                        },
                        {
                          label: "Unwind Value",
                          value: formatRs(result.masterEconomics.unwindValueRs),
                        },
                        {
                          label: "Book Unwind Per Debenture",
                          value: formatRs(result.masterEconomics.unwindQuoteRs),
                        },
                      ]}
                    />
                  </Panel>
                ) : null}

                {tab === "options" ? (
                  <div className="flex flex-col gap-4">
                    <Panel className="min-w-0 overflow-hidden !p-0 sm:!p-0">
                      <div className="border-b border-[color:var(--ar-border)] px-4 py-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <SectionTitle icon={Table2}>Options Book</SectionTitle>
                          </div>
                          <GhostButton
                            type="button"
                            className="ml-auto shrink-0 self-start"
                            disabled={exporting || computing || !result}
                            title={
                              computing || !result
                                ? "Wait until the Options Book finishes loading"
                                : "Download Options Book PDF"
                            }
                            onClick={() => void runExport("options-pdf")}
                          >
                            <FileText className="h-4 w-4" />
                            {exporting ? "Building…" : "Download Options Book PDF"}
                          </GhostButton>
                        </div>
                      </div>
                      <div className="desk-table-scroll max-h-[min(72vh,40rem)]">
                        <table className="data-table-premium data-table-fill text-sm">
                          <thead>
                            <tr>
                              {OPTION_HEADERS.map((h, i) => (
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
                            {optionMatrix.map((row, ri) => {
                              const displayOnly = outflowFlags[ri] === true;
                              return (
                              <tr
                                key={`${row[0]}-${row[1]}-${row[6]}-${ri}`}
                                className={cn(
                                  ri % 2 ? "data-table-row-alt" : undefined,
                                  displayOnly && "row-display-only",
                                )}
                              >
                                {row.map((value, ci) => {
                                  const span = optionSpans[ri][ci];
                                  if (span === 0) return null;
                                  const outflowCol = OPTION_OUTFLOW_COLUMNS.has(ci);
                                  return (
                                    <td
                                      key={`${ri}-${ci}`}
                                      rowSpan={span > 1 ? span : undefined}
                                      className={
                                        ci === 0
                                          ? "col-pinned px-3 py-2 align-top"
                                          : outflowCol && displayOnly
                                            ? "cell-value-display-only px-3 py-2 tabular-nums align-top"
                                            : outflowCol && !displayOnly
                                              ? "cell-value-highlight px-3 py-2 tabular-nums align-top"
                                              : OPTION_NUMERIC_COLUMNS.has(ci)
                                                ? "cell-value px-3 py-2 tabular-nums align-top"
                                                : "px-3 py-2 align-top"
                                      }
                                    >
                                      {value}
                                    </td>
                                  );
                                })}
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>
                ) : null}

                {tab === "active" && basis ? <ActiveManagementTab basis={basis} /> : null}
                {tab === "pricer" && basis ? <ProductPricerTab basis={basis} /> : null}
                {tab === "scenario" && basis ? <ScenarioGridTab basis={basis} /> : null}
              </>
            )}
          </RevealOutput>
        </HorizontalBand>
      </div>
    </AppPage>
  );
}
