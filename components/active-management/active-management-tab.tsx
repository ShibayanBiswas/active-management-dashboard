"use client";

import { useMemo } from "react";
import { CalendarClock, CalendarDays, Percent, Target, TriangleAlert } from "lucide-react";

import {
  AmExportButtons,
  AmPanelHeader,
  AmTableView,
  CardGrid,
  type UnwindBasis,
} from "@/components/active-management/am-table";
import { Panel, SectionTitle } from "@/components/layout/app-ui";
import { useMultiQuotes } from "@/lib/context/multi-desk-provider";
import { productKey } from "@/lib/multi/product-key";
import { activeManagementTab, type AmValue } from "@/lib/workbook/am-export-columns";

const cards = (values: AmValue[]) => values.map((v) => ({ label: v.label, value: v.text }));

/** Targets, observations and the Current and Expected rates for the unwind on screen. */
export function ActiveManagementTab({ basis }: { basis: UnwindBasis }) {
  const { quotes, deskLevels } = useMultiQuotes();
  const am = quotes[productKey(basis.product)]?.am ?? null;
  const actualTarget = am?.actualTarget ?? null;
  const actualTargetSource = am?.actualTargetSource ?? null;
  const { nifty, sensex } = deskLevels;

  const state = useMemo(() => {
    try {
      return {
        ...activeManagementTab({ ...basis, actualTarget, actualTargetSource, deskLevels: { nifty, sensex } }),
        error: null,
      };
    } catch (e) {
      return { view: null, doc: null, error: e instanceof Error ? e.message : "Active Management failed" };
    }
  }, [basis, actualTarget, actualTargetSource, nifty, sensex]);

  const { view, doc } = state;
  if (!view) {
    return <Panel className="border-red-300 text-sm text-red-700">{state.error}</Panel>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <SectionTitle icon={Target}>Targets</SectionTitle>
          </div>
          <AmExportButtons doc={doc} result={basis.result} name="Active Management" />
        </div>
        <CardGrid className="mt-1" cards={cards(view.targets)} />
      </Panel>

      <Panel>
        <SectionTitle icon={CalendarDays}>Observations</SectionTitle>
        <CardGrid className="mt-1" cards={cards(view.observations)} />
      </Panel>

      <Panel>
        <SectionTitle icon={Percent}>Internal Rates of Return</SectionTitle>
        <CardGrid className="mt-1" cards={cards(view.returns)} />
      </Panel>

      {view.warnings.length ? (
        <Panel>
          <SectionTitle icon={TriangleAlert}>Warnings</SectionTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
            {view.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="min-w-0 overflow-hidden !p-0 sm:!p-0">
        <AmPanelHeader title="Observation Schedule" icon={CalendarClock} />
        <AmTableView table={view.schedule} empty="This product has no observation dates." />
      </Panel>
    </div>
  );
}
