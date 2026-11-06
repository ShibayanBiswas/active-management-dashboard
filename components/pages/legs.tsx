"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { DeskTable, type Column } from "@/components/ui/desk-table";
import { Input, KpiBand, Segmented, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import { pricesAtLevel, type Book } from "@/lib/engine/book";
import type { LegValue } from "@/lib/engine/product-unwind";
import { downloadExcel, downloadPdf, type ExportTable } from "@/lib/export/export-table";
import { formatCrore, formatNumber, formatPct } from "@/lib/format";
import type { DeskInputs } from "@/lib/types";

type LegLine = LegValue & { productId: string; productName: string; index: number; assumedPrice: number };
type State = "all" | "live" | "expired";

function LegDesk({ book, inputs }: { book: Book; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<State>("all");
  const all = useMemo(() => {
    const assumed = pricesAtLevel(book.keys, inputs.assumedNifty, inputs.scenarioMode, book.ctx);
    return book.rows.flatMap((r) =>
      r.legs.map((lv, index) => ({ ...lv, productId: r.product.id, productName: r.product.name, index, assumedPrice: assumed.get(lv.priced.key) ?? 0 })),
    );
  }, [book, inputs.assumedNifty, inputs.scenarioMode]);
  const lines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (l) => (!q || l.productName.toLowerCase().includes(q) || String(l.leg.strike).includes(q)) && (state === "all" || (state === "expired") === l.priced.expired),
    );
  }, [all, search, state]);

  const columns: Column<LegLine>[] = [
    { id: "product", label: "Product", render: (l) => l.productName, sort: (l) => l.productName, className: "col-pinned" },
    { id: "option", label: "Option", render: (l) => l.leg.optionType, sort: (l) => l.leg.optionType },
    { id: "strike", label: "Strike", align: "right", render: (l) => formatNumber(l.leg.strike, 0), sort: (l) => l.leg.strike },
    { id: "expiry", label: "Expiry", render: (l) => formatDeskDate(l.leg.expiry), sort: (l) => l.leg.expiry },
    { id: "side", label: "Original Side", render: (l) => l.leg.side, sort: (l) => l.leg.side },
    { id: "qty", label: "Quantity", align: "right", render: (l) => formatNumber(l.leg.quantity, 0), sort: (l) => l.leg.quantity },
    { id: "state", label: "State", render: (l) => (l.priced.expired ? "Expired" : "Live"), sort: (l) => (l.priced.expired ? 1 : 0) },
    { id: "fixing", label: "Expiry Fixing", align: "right", render: (l) => formatNumber(l.priced.fixing), sort: (l) => l.priced.fixing },
    { id: "vol", label: "Model Vol", align: "right", render: (l) => formatPct(l.priced.modelVol), sort: (l) => l.priced.modelVol },
    { id: "price", label: "Current Price", align: "right", render: (l) => formatNumber(l.priced.price), sort: (l) => l.priced.price },
    { id: "delta", label: "Delta", align: "right", render: (l) => formatNumber(l.priced.delta, 3), sort: (l) => l.priced.delta },
    { id: "outflow", label: "Premium Outflow In Crore", align: "right", render: (l) => formatCrore(l.outflow + l.grownOutflow), sort: (l) => l.outflow + l.grownOutflow },
    { id: "assumed", label: "Price At Assumed Level", align: "right", render: (l) => formatNumber(l.assumedPrice), sort: (l) => l.assumedPrice },
  ];

  const table = (): ExportTable => ({
    title: "Leg Book",
    subtitle: `Valuation ${formatDeskDate(inputs.valuationDate)} · Current Nifty ${inputs.currentNifty} · Assumed Nifty ${inputs.assumedNifty} · ${lines.length} Legs`,
    columns: [
      { label: "Product", kind: "text" },
      { label: "Option", kind: "text" },
      { label: "Strike", kind: "integer" },
      { label: "Expiry", kind: "text" },
      { label: "Original Side", kind: "text" },
      { label: "Quantity", kind: "number" },
      { label: "State", kind: "text" },
      { label: "Expiry Fixing", kind: "number" },
      { label: "Model Vol", kind: "pct" },
      { label: "Current Price", kind: "number" },
      { label: "Delta", kind: "number" },
      { label: "Premium Outflow", kind: "money" },
      { label: "Price At Assumed Level", kind: "number" },
    ],
    rows: lines.map((l) => [
      l.productName,
      l.leg.optionType,
      l.leg.strike,
      formatDeskDate(l.leg.expiry),
      l.leg.side,
      l.leg.quantity,
      l.priced.expired ? "Expired" : "Live",
      l.priced.fixing,
      l.priced.modelVol,
      l.priced.price,
      l.priced.delta,
      l.outflow + l.grownOutflow,
      l.assumedPrice,
    ]),
  });

  return (
    <>
      <TabHeading
        title="Leg Book"
        subtitle="Every option leg in the book: expired legs settle at the Nifty close on expiry, live legs are priced on the surface."
        onExcel={() => void downloadExcel(table())}
        onPdf={() => void downloadPdf(table())}
        onReset={() => {
          resetInputs();
          setSearch("");
          setState("all");
        }}
      />
      <DeskInputsBar />
      <KpiBand
        items={[
          { label: "Option Legs", value: String(all.length) },
          { label: "Live Legs", value: String(all.filter((l) => !l.priced.expired).length) },
          { label: "Expired Legs", value: String(all.filter((l) => l.priced.expired).length) },
          { label: "Open Option Outflow In Crore", value: formatCrore(book.totals.openOutflow) },
        ]}
      />
      <div className="my-4 flex flex-wrap items-center gap-3 font-ui">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search Product Or Strike" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Segmented
          options={[
            { id: "all", label: "All Legs" },
            { id: "live", label: "Live" },
            { id: "expired", label: "Expired" },
          ]}
          value={state}
          onChange={setState}
        />
      </div>
      <DeskTable rows={lines} columns={columns} rowKey={(l) => `${l.productId}-${l.index}`} />
    </>
  );
}

export function LegsPage() {
  return <DeskGate>{({ book, inputs }) => <LegDesk book={book} inputs={inputs} />}</DeskGate>;
}
