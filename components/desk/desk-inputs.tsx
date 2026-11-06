"use client";

import { useState } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";

import { Field, GhostButton, Input, Panel, Segmented } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import type { DeskInputs } from "@/lib/types";

function NumberInput({ value, onCommit, step, percent }: { value: number; onCommit: (v: number) => void; step?: number; percent?: boolean }) {
  const shown = percent ? Number((value * 100).toFixed(4)) : value;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      inputMode="decimal"
      type="number"
      step={step}
      value={draft ?? String(shown)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && (percent || n > 0)) onCommit(percent ? n / 100 : n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Valuation Date, Current Nifty and Assumed Nifty drive every tab; the pricing parameters fold away. */
export function DeskInputsBar() {
  const { inputs, setInputs, refreshSpot, data } = useDesk();
  const [showRates, setShowRates] = useState(false);
  const [spotNote, setSpotNote] = useState<string | null>(null);
  if (!inputs) return null;
  const set = (patch: Partial<DeskInputs>) => setInputs(patch);
  return (
    <Panel className="input-desk-panel mb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto]">
        <Field label="Valuation Date">
          <Input type="date" value={inputs.valuationDate} onChange={(e) => e.target.value && set({ valuationDate: e.target.value })} />
        </Field>
        <Field label="Current Nifty" hint={spotNote ?? (data?.asOf ? `Desk Default ${data.asOf.currentNifty.toLocaleString("en-IN")} As Of ${formatDeskDate(data.asOf.valuationDate)}` : undefined)}>
          <div className="flex gap-2">
            <NumberInput value={inputs.currentNifty} onCommit={(v) => set({ currentNifty: v })} step={50} />
            <GhostButton
              title="Last Completed Nifty Close"
              onClick={async () => {
                setSpotNote("Fetching Live Nifty");
                setSpotNote(await refreshSpot());
              }}
            >
              <RefreshCw className="h-4 w-4" /> Live
            </GhostButton>
          </div>
        </Field>
        <Field label="Assumed Nifty">
          <NumberInput value={inputs.assumedNifty} onCommit={(v) => set({ assumedNifty: v })} step={100} />
        </Field>
        <Field label="Level Revaluation" hint="Assumed level and scenario ladder">
          <Segmented
            options={[
              { id: "delta", label: "Delta Approximation" },
              { id: "full", label: "Full Black Scholes Reprice" },
            ]}
            value={inputs.scenarioMode}
            onChange={(scenarioMode) => set({ scenarioMode })}
          />
        </Field>
        <div className="flex items-end">
          <GhostButton onClick={() => setShowRates((s) => !s)} aria-expanded={showRates}>
            <SlidersHorizontal className="h-4 w-4" /> Pricing Parameters
          </GhostButton>
        </div>
      </div>
      {showRates ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gold/20 pt-3 sm:grid-cols-3">
          <Field label="Forward Rate Percent" hint="Black Scholes forward growth">
            <NumberInput percent value={inputs.forwardRate} onCommit={(v) => set({ forwardRate: v })} step={0.25} />
          </Field>
          <Field label="Discount Spread Percent" hint="Discount rate is forward plus this spread">
            <NumberInput percent value={inputs.discountSpread} onCommit={(v) => set({ discountSpread: v })} step={0.25} />
          </Field>
          <Field label="Delta Rate Percent" hint="Rate used for the Black Scholes delta">
            <NumberInput percent value={inputs.deltaRate} onCommit={(v) => set({ deltaRate: v })} step={0.25} />
          </Field>
        </div>
      ) : null}
    </Panel>
  );
}
