"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Search } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { ExpectedDifferenceCell } from "@/components/desk/expected-difference-cell";
import { DeskTable, type Column } from "@/components/ui/desk-table";
import { Input, KpiBand, Select, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import type { Book, BookRow } from "@/lib/engine/book";
import { downloadExcel, downloadPdf, type ExportTable } from "@/lib/export/export-table";
import { formatCrore, formatNumber, formatPct } from "@/lib/format";
import { summaryRecord } from "@/lib/summary-record";
import type { DeskInputs } from "@/lib/types";

const STATUSES = ["All Statuses", "Observations Live", "Not Started", "Observations Done", "No Observations"] as const;

export function rowFilter(search: string, status: string, flaggedOnly: boolean) {
  const q = search.trim().toLowerCase();
  return (r: BookRow) =>
    (!q || r.product.name.toLowerCase().includes(q) || (r.product.productCode ?? "").toLowerCase().includes(q)) &&
    (status === "All Statuses" || r.lifecycle.status === status) &&
    (!flaggedOnly || r.unwind.warnings.length > 0);
}

function IrrCell({ irr, raw, cap }: { irr: number | null; raw: number | null; cap: number | null }) {
  const capped = raw != null && cap != null && raw > cap;
  return (
    <span title={capped ? `Uncapped ${formatPct(raw)} Capped At Max IRR` : undefined} className={capped ? "text-gold-dark" : undefined}>
      {formatPct(irr)}
    </span>
  );
}

function exportTable(rows: BookRow[], inputs: DeskInputs): ExportTable {
  return {
    title: "Book Summary",
    subtitle: `Valuation ${formatDeskDate(inputs.valuationDate)} · Current Nifty ${inputs.currentNifty} · Assumed Nifty ${inputs.assumedNifty} · ${rows.length} Products`,
    columns: [
      { label: "Product", kind: "text" },
      { label: "Status", kind: "text" },
      { label: "Pending Observations", kind: "text" },
      { label: "Actual Target", kind: "number" },
      { label: "Residual Target", kind: "number" },
      { label: "Max IRR", kind: "pct" },
      { label: "Current IRR", kind: "pct" },
      { label: "IRR At Assumed Level", kind: "pct" },
      { label: "Mobilization In Crore", kind: "crore" },
      { label: "Exit Value Current In Crore", kind: "crore" },
      { label: "Exit Value Assumed In Crore", kind: "crore" },
      { label: "Expected Difference At Maturity In Crore", kind: "crore" },
      { label: "Warnings", kind: "text" },
    ],
    rows: rows.map((row) => {
      const r = summaryRecord(row);
      return [
        r.product,
        r.status,
        r.pendingMonths,
        r.actualTarget,
        r.residualTarget,
        r.maxIrr,
        r.currentIrr,
        r.assumedIrr,
        r.mobilisationCrore,
        r.exitValueCurrentCrore,
        r.exitValueAssumedCrore,
        r.expectedDifferenceCrore,
        r.warnings.join("; ") || null,
      ];
    }),
  };
}

function SummaryDesk({ book, inputs }: { book: Book; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("All Statuses");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const rows = useMemo(() => book.rows.filter(rowFilter(search, status, flaggedOnly)), [book, search, status, flaggedOnly]);
  const sum = (f: (r: BookRow) => number | null | undefined) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);

  const columns: Column<BookRow>[] = [
    {
      id: "product",
      label: "Product",
      render: (r) => (
        <Link href={`/product/${r.product.id}`} className="font-semibold text-maroon hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.product.name}
          {r.unwind.warnings.length ? <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-amber-600" aria-label={r.unwind.warnings.join("; ")} /> : null}
        </Link>
      ),
      sort: (r) => r.product.name,
      className: "col-pinned",
    },
    { id: "pending", label: "Pending Observations", render: (r) => r.lifecycle.pendingMonths, sort: (r) => r.lifecycle.pending },
    { id: "target", label: "Actual Target", align: "right", render: (r) => formatNumber(r.product.actualTarget), sort: (r) => r.product.actualTarget },
    { id: "residual", label: "Residual Target", align: "right", render: (r) => formatNumber(r.residualTarget), sort: (r) => r.residualTarget },
    { id: "max", label: "Max IRR", align: "right", render: (r) => formatPct(r.unwind.maxIrr), sort: (r) => r.unwind.maxIrr },
    {
      id: "current",
      label: "Current IRR",
      align: "right",
      render: (r) => <IrrCell irr={r.unwind.current.cappedIrr} raw={r.unwind.current.irr} cap={r.unwind.maxIrr} />,
      sort: (r) => r.unwind.current.cappedIrr,
    },
    {
      id: "assumed",
      label: "IRR At Assumed Level",
      align: "right",
      render: (r) => <IrrCell irr={r.assumed.cappedIrr} raw={r.assumed.irr} cap={r.unwind.maxIrr} />,
      sort: (r) => r.assumed.cappedIrr,
    },
    { id: "mob", label: "Mobilization In Crore", align: "right", render: (r) => formatCrore(r.product.mobilisation), sort: (r) => r.product.mobilisation },
    { id: "exitCur", label: "Exit Value Current In Crore", align: "right", render: (r) => formatCrore(r.unwind.current.exitValue), sort: (r) => r.unwind.current.exitValue },
    { id: "exitAss", label: "Exit Value Assumed In Crore", align: "right", render: (r) => formatCrore(r.assumed.exitValue), sort: (r) => r.assumed.exitValue },
    {
      id: "expected",
      label: "Expected Difference At Maturity In Crore",
      align: "right",
      render: (r) => <ExpectedDifferenceCell unwind={r.unwind} mobilisation={r.product.mobilisation} />,
      sort: (r) => r.unwind.expected?.difference ?? null,
    },
  ];
  const totals = [
    `Book Total · ${rows.length} Products`,
    String(sum((r) => r.lifecycle.pending)),
    "",
    "",
    "",
    "",
    "",
    formatCrore(sum((r) => r.product.mobilisation)),
    formatCrore(sum((r) => r.unwind.current.exitValue)),
    formatCrore(sum((r) => r.assumed.exitValue)),
    formatCrore(sum((r) => r.unwind.expected?.difference)),
  ];
  const table = () => exportTable(rows, inputs);

  return (
    <>
      <TabHeading
        title="Book Summary"
        subtitle="Every live product revalued at the current and assumed Nifty, with observation progress and the interest only check at maturity."
        onExcel={() => void downloadExcel(table())}
        onPdf={() => void downloadPdf(table())}
        onReset={() => {
          resetInputs();
          setSearch("");
          setStatus("All Statuses");
          setFlaggedOnly(false);
        }}
      />
      <DeskInputsBar />
      <KpiBand
        items={[
          { label: "Live Products", value: String(book.totals.products) },
          { label: "Mobilization In Crore", value: formatCrore(book.totals.mobilisation) },
          { label: "Exit Value Current In Crore", value: formatCrore(book.totals.exitValueCurrent) },
          { label: "Exit Value Assumed In Crore", value: formatCrore(book.totals.exitValueAssumed) },
          { label: "Expected Difference At Maturity In Crore", value: formatCrore(book.totals.expectedDifference) },
          { label: "Products With Warnings", value: String(book.totals.withWarnings) },
        ]}
      />
      <div className="my-4 flex flex-wrap items-end gap-3 font-ui">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search Product Or Code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-56">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Observation Status">
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Products With Warnings Only
        </label>
      </div>
      <DeskTable rows={rows} columns={columns} rowKey={(r) => r.product.id} totals={totals} onRowClick={(r) => router.push(`/product/${r.product.id}`)} />
    </>
  );
}

export function BookSummaryPage() {
  return <DeskGate>{({ book, inputs }) => <SummaryDesk book={book} inputs={inputs} />}</DeskGate>;
}
