"use client";

import { useMemo } from "react";
import { Table2 } from "lucide-react";

import {
  AmExportButtons,
  AmPanelHeader,
  AmTableView,
  type UnwindBasis,
} from "@/components/active-management/am-table";
import { Panel } from "@/components/layout/app-ui";
import { productPricerTab } from "@/lib/workbook/am-export-columns";

/** The Pricer Table for this product at the page's inputs, joined to its Options Book cash. */
export function ProductPricerTab({ basis }: { basis: UnwindBasis }) {
  const state = useMemo(() => {
    try {
      return { ...productPricerTab(basis), error: null };
    } catch (e) {
      return { table: null, doc: null, error: e instanceof Error ? e.message : "Pricer failed" };
    }
  }, [basis]);

  return (
    <Panel className="min-w-0 overflow-hidden !p-0 sm:!p-0">
      <AmPanelHeader title="Pricer Table" icon={Table2}>
        <AmExportButtons doc={state.doc} result={basis.result} name="Pricer Table" />
      </AmPanelHeader>
      {state.error ? <p className="px-4 py-3 text-sm text-red-600">{state.error}</p> : null}
      {state.table ? <AmTableView table={state.table} empty="This product has no option legs." /> : null}
    </Panel>
  );
}
