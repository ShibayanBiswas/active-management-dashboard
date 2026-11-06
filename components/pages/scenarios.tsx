"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { Input, Segmented, TabHeading } from "@/components/ui/desk-ui";
import { cn } from "@/lib/cn";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import { scenarioGrid, type Book, type BookRow } from "@/lib/engine/book";
import type { UnwindAtLevel } from "@/lib/engine/product-unwind";
import { downloadExcel, downloadPdf, type ExportKind } from "@/lib/export/export-table";
import { formatCrore, formatNumber, formatPct, toCrore } from "@/lib/format";
import type { DeskInputs } from "@/lib/types";

type Metric = "irr" | "price" | "outflow";
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "irr", label: "Capped IRR" },
  { id: "price", label: "Unwind Price" },
  { id: "outflow", label: "Premium Outflow In Crore" },
];

function cellValue(cell: UnwindAtLevel, metric: Metric): number | null {
  if (metric === "irr") return cell.cappedIrr;
  if (metric === "price") return cell.unwindPrice;
  return toCrore(cell.premiumOutflow);
}

function cellText(v: number | null, metric: Metric): string {
  if (metric === "irr") return formatPct(v, 2);
  if (metric === "price") return formatNumber(v, 0);
  return formatNumber(v, 3);
}

/** Maroon for the low end of the row, gold through to green at the high end. */
function heat(v: number | null, lo: number, hi: number): string | undefined {
  if (v == null || !Number.isFinite(v) || hi <= lo) return undefined;
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const hue = 350 + t * 140;
  return `hsla(${hue % 360}, 55%, 50%, ${0.1 + t * 0.22})`;
}

function ScenarioDesk({ book, inputs }: { book: Book; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const [metric, setMetric] = useState<Metric>("irr");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? book.rows.filter((r) => r.product.name.toLowerCase().includes(q)) : book.rows;
  }, [book, search]);
  const grid = useMemo(() => scenarioGrid(book, inputs.scenarioMode, rows), [book, inputs.scenarioMode, rows]);
  const centre = Math.round(inputs.currentNifty / 100) * 100;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 41, overscan: 10 });
  const items = virtualizer.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  const exportData = () => {
    const kind: ExportKind = metric === "irr" ? "pct" : metric === "price" ? "number" : "crore";
    return {
      title: "Scenario Grid",
      subtitle: `${METRICS.find((m) => m.id === metric)!.label} · ${inputs.scenarioMode === "delta" ? "Delta Approximation" : "Full Black Scholes Reprice"} · Valuation ${formatDeskDate(inputs.valuationDate)} · Current Nifty ${inputs.currentNifty}`,
      columns: [{ label: "Product", kind: "text" as ExportKind }, ...grid.levels.map((l) => ({ label: String(l), kind }))],
      rows: [
        ...rows.map((r, i) => [r.product.name, ...grid.cells[i].map((c) => cellValue(c, metric))]),
        ["Book Exit Value In Crore", ...grid.exitTotals.map((t) => toCrore(t))],
      ],
    };
  };

  const renderRow = (row: BookRow, i: number) => {
    const values = grid.cells[i].map((c) => cellValue(c, metric));
    const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    return (
      <tr key={row.product.id} className="desk-virtual-row">
        <td className="col-pinned">
          <Link href={`/product/${row.product.id}`} className="font-semibold text-maroon hover:underline">
            {row.product.name}
          </Link>
        </td>
        {values.map((v, j) => (
          <td key={grid.levels[j]} className="text-right tabular-nums" style={{ background: heat(v, lo, hi) }}>
            {cellText(v, metric)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <>
      <TabHeading
        title="Scenario Grid"
        subtitle="Every product revalued from 1,000 points below to 1,500 points above the current Nifty, in steps of 100."
        onExcel={() => void downloadExcel(exportData())}
        onPdf={() => void downloadPdf(exportData())}
        onReset={() => {
          resetInputs();
          setMetric("irr");
          setSearch("");
        }}
      />
      <DeskInputsBar />
      <div className="mb-4 flex flex-wrap items-center gap-3 font-ui">
        <Segmented options={METRICS} value={metric} onChange={setMetric} />
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search Product" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div ref={scrollRef} className="desk-table-scroll desk-table-scroll--book font-ui">
        <table className="data-table-premium">
          <thead>
            <tr>
              <th className="col-pinned">Product</th>
              {grid.levels.map((l) => (
                <th key={l} className={cn("text-right", l === centre && "!bg-gold/30")}>
                  {l.toLocaleString("en-IN")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="row-total">
              <td className="col-pinned">Book Exit Value In Crore</td>
              {grid.exitTotals.map((t, j) => (
                <td key={grid.levels[j]} className="text-right">
                  {formatCrore(t, 2)}
                </td>
              ))}
            </tr>
            {padTop > 0 ? (
              <tr aria-hidden className="virtual-spacer">
                <td colSpan={grid.levels.length + 1} style={{ height: padTop }} />
              </tr>
            ) : null}
            {items.map((item) => renderRow(rows[item.index], item.index))}
            {padBottom > 0 ? (
              <tr aria-hidden className="virtual-spacer">
                <td colSpan={grid.levels.length + 1} style={{ height: padBottom }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ScenariosPage() {
  return <DeskGate>{({ book, inputs }) => <ScenarioDesk book={book} inputs={inputs} />}</DeskGate>;
}
