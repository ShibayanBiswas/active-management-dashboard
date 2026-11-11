"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Download, FileText, type LucideIcon } from "lucide-react";

import { GhostButton, PrimaryButton, SectionTitle, SpecRail } from "@/components/layout/app-ui";
import type { ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import { cn, computeGroupedRowSpans } from "@/lib/utils";
import type { AmExportDoc, AmTable } from "@/lib/workbook/am-export-columns";

/** The unwind on screen and exactly what it ran on, expiry closes included. */
export type UnwindBasis = {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  result: UnwindResult;
};

/**
 * SpecRail cards that wrap into rows instead of scrolling sideways: one column on a phone,
 * as many 12rem columns as fit on a tablet or desktop.
 */
const REFLOW =
  "[&_.horizontal-rail-spec-inner]:grid-flow-row [&_.horizontal-rail-spec-inner]:grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]";

export function CardGrid({ cards, className }: { cards: Array<{ label: string; value: string }>; className?: string }) {
  return <SpecRail className={cn(REFLOW, className)} cards={cards} />;
}

/** Panel header, as on the Options Book: title left, downloads right, below the title on a phone. */
export function AmPanelHeader({ title, icon, children }: { title: string; icon: LucideIcon; children?: ReactNode }) {
  return (
    <div className="border-b border-[color:var(--ar-border)] px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <SectionTitle icon={icon}>{title}</SectionTitle>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Excel and PDF downloads for one Active Management tab. */
export function AmExportButtons({ doc, result, name }: { doc: AmExportDoc | null; result: UnwindResult; name: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExport(kind: "excel" | "pdf") {
    if (!doc || exporting) return;
    setExporting(true);
    setError(null);
    try {
      if (kind === "excel") {
        const { downloadActiveManagementExcel } = await import("@/lib/workbook/export-screen");
        await downloadActiveManagementExcel(doc, result);
      } else {
        const { downloadActiveManagementPdf } = await import("@/lib/workbook/export-screen");
        await downloadActiveManagementPdf(doc, result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const waiting = `Wait until the ${name} finishes loading`;
  return (
    <div className="ml-auto flex max-w-full shrink-0 flex-col items-end gap-2 self-start">
      <div className="flex flex-wrap justify-end gap-2">
        <PrimaryButton
          type="button"
          disabled={exporting || !doc}
          title={doc ? `Download ${name} Excel` : waiting}
          onClick={() => void runExport("excel")}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Building…" : `Download ${name} Excel`}
        </PrimaryButton>
        <GhostButton
          type="button"
          disabled={exporting || !doc}
          title={doc ? `Download ${name} PDF` : waiting}
          onClick={() => void runExport("pdf")}
        >
          <FileText className="h-4 w-4" />
          {exporting ? "Building…" : `Download ${name} PDF`}
        </GhostButton>
      </div>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Desk table for an Active Management view. A cell takes the value style when its Excel cell
 * is a number; clubbed cells follow the table's merge columns, as on the Options Book.
 */
export function AmTableView({ table, empty }: { table: AmTable; empty: string }) {
  const spans = useMemo(
    () => computeGroupedRowSpans(table.text, [...(table.mergeCols ?? [])], table.groupCol),
    [table],
  );
  return (
    <div className="desk-table-scroll max-h-[min(72vh,40rem)]">
      <table className="data-table-premium data-table-fill text-sm">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th
                key={h}
                className={
                  i === 0 ? "col-pinned whitespace-nowrap px-3 py-2 text-left" : "whitespace-nowrap px-3 py-2 text-left"
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.text.length === 0 ? (
            <tr>
              <td className="px-3 py-10 text-center text-muted" colSpan={table.headers.length}>
                {empty}
              </td>
            </tr>
          ) : (
            table.text.map((row, ri) => {
              const highlight = ri === table.highlightRow;
              return (
                <tr
                  key={`${row[0]}-${ri}`}
                  // row-selected outranks the plain row background only on an alt row.
                  className={cn((ri % 2 === 1 || highlight) && "data-table-row-alt", highlight && "row-selected")}
                >
                  {row.map((value, ci) => {
                    const span = spans[ri]?.[ci] ?? 1;
                    if (span === 0) return null;
                    const numeric = typeof table.excel[ri]?.[ci] === "number";
                    return (
                      <td
                        key={`${ri}-${ci}`}
                        rowSpan={span > 1 ? span : undefined}
                        className={
                          ci === 0
                            ? "col-pinned px-3 py-2 align-top font-semibold"
                            : numeric && highlight
                              ? "cell-value-highlight px-3 py-2 tabular-nums align-top"
                              : numeric
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
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
