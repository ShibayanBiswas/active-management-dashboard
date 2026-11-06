"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { ExpectedDifferenceCell } from "@/components/desk/expected-difference-cell";
import { rowFilter } from "@/components/pages/book-summary";
import { DeskTable, type Column } from "@/components/ui/desk-table";
import { Input, KpiBand, Select, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import type { Book, BookRow } from "@/lib/engine/book";
import { downloadExcel, downloadPdf, type ExportTable } from "@/lib/export/export-table";
import { formatCrore, formatNumber } from "@/lib/format";
import type { DeskInputs } from "@/lib/types";

const STATUS_CLASS: Record<string, string> = {
  "Observations Done": "status-badge-expired",
  "Observations Live": "status-badge-observation-near",
  "Not Started": "status-badge-observation-scheduled",
  "No Observations": "status-badge-unknown",
};

function exportTable(rows: BookRow[], inputs: DeskInputs): ExportTable {
  return {
    title: "Observations And Targets",
    subtitle: `Valuation ${formatDeskDate(inputs.valuationDate)} · ${rows.length} Products`,
    columns: [
      { label: "Product", kind: "text" },
      { label: "Status", kind: "text" },
      { label: "Observations Done", kind: "integer" },
      { label: "Total Observations", kind: "integer" },
      { label: "Pending Observations", kind: "integer" },
      { label: "Average So Far", kind: "number" },
      { label: "Actual Target", kind: "number" },
      { label: "Residual Target", kind: "number" },
      { label: "Pending Months", kind: "text" },
      { label: "Next Observation", kind: "text" },
      { label: "Expected Difference At Maturity In Crore", kind: "crore" },
    ],
    rows: rows.map((r) => [
      r.product.name,
      r.lifecycle.status,
      r.lifecycle.done,
      r.lifecycle.total,
      r.lifecycle.pending,
      r.lifecycle.averageSoFar,
      r.product.actualTarget,
      r.residualTarget,
      r.lifecycle.pendingMonths,
      r.lifecycle.pendingDates[0] ? formatDeskDate(r.lifecycle.pendingDates[0]) : null,
      r.unwind.expected ? r.unwind.expected.difference / 1e7 : null,
    ]),
  };
}

function ObservationDesk({ book, inputs }: { book: Book; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const rows = useMemo(() => book.rows.filter(rowFilter(search, status, false)), [book, search, status]);
  const count = (s: string) => book.rows.filter((r) => r.lifecycle.status === s).length;

  const columns: Column<BookRow>[] = [
    {
      id: "product",
      label: "Product",
      render: (r) => (
        <Link href={`/product/${r.product.id}`} className="font-semibold text-maroon hover:underline">
          {r.product.name}
        </Link>
      ),
      sort: (r) => r.product.name,
      className: "col-pinned",
    },
    { id: "status", label: "Status", render: (r) => <span className={`status-badge ${STATUS_CLASS[r.lifecycle.status]}`}>{r.lifecycle.status}</span>, sort: (r) => r.lifecycle.status },
    { id: "done", label: "Done", align: "right", render: (r) => r.lifecycle.done, sort: (r) => r.lifecycle.done },
    { id: "total", label: "Total", align: "right", render: (r) => r.lifecycle.total, sort: (r) => r.lifecycle.total },
    { id: "pending", label: "Pending", align: "right", render: (r) => r.lifecycle.pending, sort: (r) => r.lifecycle.pending },
    { id: "avg", label: "Average So Far", align: "right", render: (r) => formatNumber(r.lifecycle.averageSoFar), sort: (r) => r.lifecycle.averageSoFar },
    { id: "target", label: "Actual Target", align: "right", render: (r) => formatNumber(r.product.actualTarget), sort: (r) => r.product.actualTarget },
    { id: "residual", label: "Residual Target", align: "right", render: (r) => formatNumber(r.residualTarget), sort: (r) => r.residualTarget },
    { id: "months", label: "Pending Months", render: (r) => r.lifecycle.pendingMonths },
    { id: "next", label: "Next Observation", render: (r) => formatDeskDate(r.lifecycle.pendingDates[0]), sort: (r) => r.lifecycle.pendingDates[0] ?? null },
    {
      id: "fixings",
      label: "Observation Closes",
      render: (r) =>
        r.lifecycle.dates
          .map((d, i) => `${formatDeskDate(d)} ${r.lifecycle.fixings[i] != null ? formatNumber(r.lifecycle.fixings[i], 2) : "Pending"}`)
          .join(" · ") || "-",
    },
    {
      id: "expected",
      label: "Expected Difference At Maturity In Crore",
      align: "right",
      render: (r) => <ExpectedDifferenceCell unwind={r.unwind} mobilisation={r.product.mobilisation} />,
      sort: (r) => r.unwind.expected?.difference ?? null,
    },
  ];
  const table = () => exportTable(rows, inputs);

  return (
    <>
      <TabHeading
        title="Observations And Targets"
        subtitle="Nifty closes on each observation date, the average so far, and the level the pending observations must average to reach the target."
        onExcel={() => void downloadExcel(table())}
        onPdf={() => void downloadPdf(table())}
        onReset={() => {
          resetInputs();
          setSearch("");
          setStatus("All Statuses");
        }}
      />
      <DeskInputsBar />
      <KpiBand
        items={[
          { label: "Observations Live", value: String(count("Observations Live")) },
          { label: "Not Started", value: String(count("Not Started")) },
          { label: "Observations Done", value: String(count("Observations Done")) },
          { label: "Pending Observations", value: String(book.rows.reduce((s, r) => s + r.lifecycle.pending, 0)) },
          { label: "Expected Difference At Maturity In Crore", value: formatCrore(book.totals.expectedDifference) },
        ]}
      />
      <div className="my-4 flex flex-wrap items-end gap-3 font-ui">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search Product Or Code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-56">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Observation Status">
            {["All Statuses", "Observations Live", "Not Started", "Observations Done", "No Observations"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>
      <DeskTable rows={rows} columns={columns} rowKey={(r) => r.product.id} />
    </>
  );
}

export function ObservationsPage() {
  return <DeskGate>{({ book, inputs }) => <ObservationDesk book={book} inputs={inputs} />}</DeskGate>;
}
