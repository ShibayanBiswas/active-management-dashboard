"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart } from "lucide-react";

import {
  AmExportButtons,
  AmPanelHeader,
  AmTableView,
  CardGrid,
  type UnwindBasis,
} from "@/components/active-management/am-table";
import { cachedScenarioGrid, scenarioGridFor } from "@/components/active-management/scenario-grid-runner";
import { Panel } from "@/components/layout/app-ui";
import { DeskLoadingState } from "@/components/ui/desk-loading";
import { SCENARIO_STEPS_EACH_SIDE, type ScenarioGrid } from "@/lib/active-management/scenario";
import { formatNumber } from "@/lib/utils";
import { scenarioFlatNote, scenarioGridTab } from "@/lib/workbook/am-export-columns";

const LEVELS = 2 * SCENARIO_STEPS_EACH_SIDE + 1;

type Run = { basis: UnwindBasis; grid: ScenarioGrid | null; done: number; error: string | null };

/** The unwind at ±1,000 index points around the unwinding level, priced when the tab opens. */
export function ScenarioGridTab({ basis }: { basis: UnwindBasis }) {
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    if (cachedScenarioGrid(basis)) return;
    let cancelled = false;
    setRun({ basis, grid: null, done: 0, error: null });
    scenarioGridFor(basis, {
      cancelled: () => cancelled,
      onLevel: (done) => {
        if (!cancelled) setRun({ basis, grid: null, done, error: null });
      },
    })
      .then((grid) => {
        if (cancelled || !grid) return;
        setRun({ basis, grid, done: LEVELS, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRun({ basis, grid: null, done: 0, error: e instanceof Error ? e.message : "Scenario Grid failed" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [basis]);

  const current = run?.basis === basis ? run : null;
  const grid = cachedScenarioGrid(basis) ?? current?.grid ?? null;
  const tab = useMemo(() => (grid ? scenarioGridTab(grid) : null), [grid]);
  const flatNote = grid ? scenarioFlatNote(grid) : null;

  return (
    <Panel className="min-w-0 overflow-hidden !p-0 sm:!p-0">
      <AmPanelHeader title="Scenario Grid" icon={LineChart}>
        <AmExportButtons doc={tab?.doc ?? null} result={basis.result} name="Scenario Grid" />
      </AmPanelHeader>
      {current?.error ? <p className="px-4 py-3 text-sm text-red-600">{current.error}</p> : null}
      {grid && tab ? (
        <>
          <div className="border-b border-[color:var(--ar-border)] px-4 py-3">
            <CardGrid
              cards={[
                { label: "Underlying", value: grid.underlying },
                { label: "Base Index Level", value: formatNumber(grid.baseSpot, 2) },
                { label: "Level Step", value: `${formatNumber(grid.step, 0)} Index Points` },
                { label: "Live Options", value: formatNumber(grid.liveLegs, 0) },
                { label: "Expired Options", value: formatNumber(grid.expiredLegs, 0) },
              ]}
            />
            {flatNote ? <p className="mt-3 text-sm text-muted">{flatNote}</p> : null}
          </div>
          <AmTableView table={tab.table} empty="No index levels to show." />
        </>
      ) : current?.error ? null : (
        <DeskLoadingState
          title="Building Scenario Grid"
          subtitle={`Pricing Index Level ${Math.min((current?.done ?? 0) + 1, LEVELS)} Of ${LEVELS}`}
        />
      )}
    </Panel>
  );
}
