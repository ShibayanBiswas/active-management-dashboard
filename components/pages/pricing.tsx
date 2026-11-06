"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { DeskTable, type Column } from "@/components/ui/desk-table";
import { Input, KpiBand, Panel, SectionTitle, Segmented, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import type { Book } from "@/lib/engine/book";
import type { PricedKey } from "@/lib/engine/leg-pricing";
import { surfaceStrikes } from "@/lib/engine/vol-surface";
import { downloadExcel, downloadPdf, type ExportTable } from "@/lib/export/export-table";
import { formatNumber, formatPct } from "@/lib/format";
import type { DeskData, DeskInputs } from "@/lib/types";

type KeyLine = PricedKey & { legs: number; gap: number | null };

function PricingDesk({ book, data, inputs }: { book: Book; data: DeskData; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"live" | "expired" | "all">("live");
  const all = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of book.rows) for (const lv of r.legs) counts.set(lv.priced.key, (counts.get(lv.priced.key) ?? 0) + 1);
    return [...book.keys.values()].map((k) => ({ ...k, legs: counts.get(k.key) ?? 0, gap: k.marketPrice != null && !k.expired ? k.price - k.marketPrice : null }));
  }, [book]);
  const lines = useMemo(() => {
    const q = search.trim();
    return all
      .filter((k) => (!q || String(k.strike).includes(q) || k.expiry.includes(q)) && (state === "all" || (state === "expired") === k.expired))
      .sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.strike - b.strike));
  }, [all, search, state]);

  const columns: Column<KeyLine>[] = [
    { id: "option", label: "Option", render: (k) => k.optionType, sort: (k) => k.optionType, className: "col-pinned" },
    { id: "strike", label: "Strike", align: "right", render: (k) => formatNumber(k.strike, 0), sort: (k) => k.strike },
    { id: "expiry", label: "Expiry", render: (k) => formatDeskDate(k.expiry), sort: (k) => k.expiry },
    { id: "side", label: "Original Side", render: (k) => k.side, sort: (k) => k.side },
    { id: "surface", label: "Surface Vol", align: "right", render: (k) => formatPct(k.surfaceVol), sort: (k) => k.surfaceVol },
    { id: "spread", label: "Bid And Ask Spread", align: "right", render: (k) => formatPct(k.spread), sort: (k) => k.spread },
    { id: "vol", label: "Model Vol", align: "right", render: (k) => formatPct(k.modelVol), sort: (k) => k.modelVol },
    { id: "price", label: "Model Price", align: "right", render: (k) => formatNumber(k.price), sort: (k) => k.price },
    { id: "bid", label: "Market Bid", align: "right", render: (k) => formatNumber(k.marketBid), sort: (k) => k.marketBid },
    { id: "ask", label: "Market Ask", align: "right", render: (k) => formatNumber(k.marketAsk), sort: (k) => k.marketAsk },
    { id: "market", label: "Market Price For Side", align: "right", render: (k) => formatNumber(k.marketPrice), sort: (k) => k.marketPrice },
    { id: "gap", label: "Model Minus Market", align: "right", render: (k) => formatNumber(k.gap), sort: (k) => k.gap },
    { id: "delta", label: "Delta", align: "right", render: (k) => formatNumber(k.delta, 3), sort: (k) => k.delta },
    { id: "fixing", label: "Expiry Fixing", align: "right", render: (k) => formatNumber(k.fixing), sort: (k) => k.fixing },
    { id: "legs", label: "Legs", align: "right", render: (k) => k.legs, sort: (k) => k.legs },
  ];

  const table = (): ExportTable => ({
    title: "Option Pricing",
    subtitle: `Valuation ${formatDeskDate(inputs.valuationDate)} · Current Nifty ${inputs.currentNifty} · ${data.surface.label} · ${lines.length} Pricing Keys`,
    columns: columns.map((c) => ({ label: c.label, kind: ["option", "expiry", "side"].includes(c.id) ? "text" : ["surface", "spread", "vol"].includes(c.id) ? "pct" : "number" })),
    rows: lines.map((k) => [k.optionType, k.strike, formatDeskDate(k.expiry), k.side, k.surfaceVol, k.spread, k.modelVol, k.price, k.marketBid, k.marketAsk, k.marketPrice, k.gap, k.delta, k.fixing, k.legs]),
  });

  const strikes = surfaceStrikes(data.surface);
  const live = all.filter((k) => !k.expired);
  return (
    <>
      <TabHeading
        title="Option Chain And Surface Pricing"
        subtitle="One price per strike, expiry, option and side. Model prices use the surface vol plus or minus the bid ask spread; market prices interpolate the uploaded option chains."
        onExcel={() => void downloadExcel(table())}
        onPdf={() => void downloadPdf(table())}
        onReset={() => {
          resetInputs();
          setSearch("");
          setState("live");
        }}
      />
      <DeskInputsBar />
      <KpiBand
        items={[
          { label: "Pricing Keys", value: String(all.length) },
          { label: "Live Keys", value: String(live.length) },
          { label: "Live Keys With Market Quotes", value: String(live.filter((k) => k.marketPrice != null).length) },
          { label: "Option Chains Loaded", value: String(data.chains.length) },
          { label: "Surface Expiries", value: String(data.surface.expiries.length) },
        ]}
      />
      <div className="my-4 flex flex-wrap items-center gap-3 font-ui">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search Strike Or Expiry" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Segmented
          options={[
            { id: "live", label: "Live Keys" },
            { id: "expired", label: "Expired Keys" },
            { id: "all", label: "All Keys" },
          ]}
          value={state}
          onChange={setState}
        />
      </div>
      <DeskTable rows={lines} columns={columns} rowKey={(k) => k.key} />
      <div className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel>
          <SectionTitle>{data.surface.label}</SectionTitle>
          <p className="mb-3 text-sm text-muted">Reference Level {formatNumber(data.surface.referenceLevel)} · vols in percent points</p>
          <div className="desk-table-scroll vol-grid">
            <table className="data-table-premium">
              <thead>
                <tr>
                  <th className="col-pinned">Expiry</th>
                  {data.surface.moneyness.map((m, i) => (
                    <th key={m} className="text-right">
                      {formatNumber(m * 100, 0)} · {formatNumber(strikes[i], 0)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.surface.expiries.map((e, r) => (
                  <tr key={e}>
                    <td className="col-pinned vol-expiry-cell">{formatDeskDate(e)}</td>
                    {data.surface.volsPercent[r].map((v, c) => (
                      <td key={c} className="text-right">
                        {formatNumber(v, 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SectionTitle>Option Chains</SectionTitle>
          <ul className="space-y-2 text-sm">
            {data.chains.map((c) => (
              <li key={c.month} className="desk-chip flex justify-between">
                <span>Expiry {formatDeskDate(c.expiry)}</span>
                <span>{c.rows.length} Strikes</span>
              </li>
            ))}
          </ul>
          <SectionTitle>Bid And Ask Spread By Expiry</SectionTitle>
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {data.bidAsk
              .filter((b) => b.expiry >= inputs.valuationDate)
              .slice(0, 24)
              .map((b) => (
                <li key={b.expiry} className="desk-chip flex justify-between">
                  <span>{formatDeskDate(b.expiry)}</span>
                  <span>{formatPct(b.spread)}</span>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

export function PricingPage() {
  return <DeskGate>{(ctx) => <PricingDesk {...ctx} />}</DeskGate>;
}
