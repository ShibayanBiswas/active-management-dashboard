"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { DeskInputsBar } from "@/components/desk/desk-inputs";
import { ExpectedDifferenceCell } from "@/components/desk/expected-difference-cell";
import { Input, KpiBand, Panel, SectionTitle, SpecRail, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";
import { productAtLevels, scenarioLevels, type Book, type BookRow } from "@/lib/engine/book";
import { downloadExcel, downloadPdf, type ExportTable } from "@/lib/export/export-table";
import { formatCrore, formatNumber, formatPct, formatRupees } from "@/lib/format";
import type { DeskInputs } from "@/lib/types";

function defaultLevels(current: number): number[] {
  const base = Math.round(current / 500) * 500;
  return [base, base + 500, base + 1000, base + 1500];
}

function ProductDesk({ book, row, inputs }: { book: Book; row: BookRow; inputs: DeskInputs }) {
  const { resetInputs } = useDesk();
  const { product, unwind, lifecycle } = row;
  const [levels, setLevels] = useState<number[]>(() => defaultLevels(inputs.currentNifty));
  const whatIf = useMemo(() => productAtLevels(book, row, levels, inputs.scenarioMode), [book, row, levels, inputs.scenarioMode]);
  const ladderLevels = useMemo(() => scenarioLevels(inputs.currentNifty), [inputs.currentNifty]);
  const ladder = useMemo(() => productAtLevels(book, row, ladderLevels, inputs.scenarioMode), [book, row, ladderLevels, inputs.scenarioMode]);
  const e = unwind.expected;

  const table = (): ExportTable => ({
    title: product.name,
    subtitle: `One Product What If · Valuation ${formatDeskDate(inputs.valuationDate)} · Current Nifty ${inputs.currentNifty}`,
    columns: [
      { label: "Nifty Level", kind: "number" },
      { label: "Premium Outflow", kind: "money" },
      { label: "Unwind Price", kind: "number" },
      { label: "IRR", kind: "pct" },
      { label: "Capped IRR", kind: "pct" },
      { label: "Exit Value In Crore", kind: "crore" },
    ],
    rows: [
      ["Current", unwind.current.premiumOutflow, unwind.current.unwindPrice, unwind.current.irr, unwind.current.cappedIrr, (unwind.current.exitValue ?? 0) / 1e7],
      ...ladderLevels.map((l, i) => [l, ladder[i].premiumOutflow, ladder[i].unwindPrice, ladder[i].irr, ladder[i].cappedIrr, ladder[i].exitValue != null ? ladder[i].exitValue! / 1e7 : null]),
    ],
  });

  return (
    <>
      <Link href="/" className="mb-3 inline-flex items-center gap-1.5 font-ui text-sm font-semibold text-maroon hover:underline">
        <ArrowLeft className="h-4 w-4" /> Book Summary
      </Link>
      <TabHeading
        title={product.name}
        subtitle="One product what if: the unwind at the current Nifty and at any level you enter, with its observation schedule and option legs."
        onExcel={() => void downloadExcel(table())}
        onPdf={() => void downloadPdf(table())}
        onReset={() => {
          resetInputs();
          setLevels(defaultLevels(inputs.currentNifty));
        }}
      />
      <DeskInputsBar />
      {unwind.warnings.length ? <p className="desk-alert mb-4">{unwind.warnings.join(" · ")}</p> : null}
      <SpecRail
        cards={[
          { label: "Product Code", value: product.productCode ?? "-" },
          { label: "Allotment Date", value: formatDeskDate(product.allotmentDate) },
          { label: "Maturity Date", value: formatDeskDate(product.maturityDate) },
          { label: "Tenor Days", value: formatNumber(product.tenorDays, 0) },
          { label: "Mobilization In Crore", value: formatCrore(product.mobilisation) },
          { label: "Face Value", value: formatRupees(product.faceValue, 0) },
          { label: "Debentures", value: formatNumber(unwind.debentures, 0) },
          { label: "Coupon", value: formatPct(product.coupon) },
        ]}
      />
      <div className="mt-4">
        <KpiBand
          items={[
            { label: "Unwind Price", value: formatNumber(unwind.current.unwindPrice) },
            { label: "Current IRR", value: formatPct(unwind.current.cappedIrr) },
            { label: "Max IRR", value: formatPct(unwind.maxIrr) },
            { label: "Pending Observations", value: lifecycle.pendingMonths },
            { label: "Actual Target", value: formatNumber(product.actualTarget) },
            { label: "Residual Target", value: formatNumber(row.residualTarget) },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionTitle>What If Levels</SectionTitle>
          <div className="desk-table-scroll font-ui">
            <table className="data-table-premium data-table-fill">
              <thead>
                <tr>
                  <th>Nifty Level</th>
                  <th className="text-right">Current {formatNumber(inputs.currentNifty, 0)}</th>
                  {levels.map((l, i) => (
                    <th key={i} className="text-right">
                      <Input
                        type="number"
                        step={100}
                        aria-label={`Level ${i + 1}`}
                        className="w-28 text-right"
                        value={l}
                        onChange={(ev) => {
                          const v = Number(ev.target.value);
                          if (v > 0) setLevels((prev) => prev.map((x, j) => (j === i ? v : x)));
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cell-metric">Capped IRR</td>
                  <td className="text-right">{formatPct(unwind.current.cappedIrr)}</td>
                  {whatIf.map((w, i) => (
                    <td key={i} className="text-right">
                      {formatPct(w.cappedIrr)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cell-metric">Quote</td>
                  <td className="text-right">{formatNumber(unwind.current.unwindPrice)}</td>
                  {whatIf.map((w, i) => (
                    <td key={i} className="text-right">
                      {formatNumber(w.unwindPrice)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cell-metric">Exit Value In Crore</td>
                  <td className="text-right">{formatCrore(unwind.current.exitValue)}</td>
                  {whatIf.map((w, i) => (
                    <td key={i} className="text-right">
                      {formatCrore(w.exitValue)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SectionTitle>Expected Difference At Maturity</SectionTitle>
          {e ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 font-ui text-sm">
              <dt className="text-muted">Grown Mobilization At Maturity</dt>
              <dd className="text-right tabular-nums">{formatRupees(e.grownMobilisationAtMaturity)}</dd>
              <dt className="text-muted">Grown Premium At Maturity</dt>
              <dd className="text-right tabular-nums">{formatRupees(e.grownPremiumAtMaturity)}</dd>
              <dt className="text-muted">Grown Margin At Maturity</dt>
              <dd className="text-right tabular-nums">{formatRupees(e.grownMarginAtMaturity)}</dd>
              <dt className="font-semibold">Interest Only Book At Maturity</dt>
              <dd className="text-right font-semibold tabular-nums">{formatRupees(e.interestOnlyBookAtMaturity)}</dd>
              <dt className="text-muted" title="Face Value times One Plus Coupon times Debentures">
                Contractual Terminal
              </dt>
              <dd className="text-right tabular-nums">{formatRupees(e.contractualTerminal)}</dd>
              <dt className="text-muted">Remaining Option Outflow At Maturity</dt>
              <dd className="text-right tabular-nums">{formatRupees(e.remainingOutflowAtMaturity)}</dd>
              <dt className="font-semibold">Expected Difference In Crore</dt>
              <dd className="text-right">
                <ExpectedDifferenceCell unwind={unwind} mobilisation={product.mobilisation} />
              </dd>
              <dt className="text-muted">Settled Expiry Payoffs To Date</dt>
              <dd className="text-right tabular-nums">{formatRupees(unwind.realisedOutflow)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">-</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionTitle>Observation Schedule</SectionTitle>
          <table className="schedule-table font-ui">
            <thead>
              <tr>
                <th>Observation Date</th>
                <th>Nifty Close</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {lifecycle.dates.length ? (
                lifecycle.dates.map((d, i) => (
                  <tr key={d}>
                    <th>{formatDeskDate(d)}</th>
                    <td>{formatNumber(lifecycle.fixings[i])}</td>
                    <td>{lifecycle.fixings[i] != null ? "Observed" : d <= inputs.valuationDate ? "Fixing Missing" : "Pending"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>-</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 font-ui text-sm text-muted">
            Average So Far {formatNumber(lifecycle.averageSoFar)} · {lifecycle.done} Of {lifecycle.total} Observed · {lifecycle.status}
          </p>
        </Panel>
        <Panel>
          <SectionTitle>Scenario Ladder</SectionTitle>
          <div className="desk-table-scroll font-ui">
            <table className="data-table-premium data-table-fill">
              <thead>
                <tr>
                  <th>Nifty Level</th>
                  <th className="text-right">Unwind Price</th>
                  <th className="text-right">Capped IRR</th>
                </tr>
              </thead>
              <tbody>
                {ladderLevels.map((l, i) => (
                  <tr key={l}>
                    <td>{formatNumber(l, 0)}</td>
                    <td className="text-right">{formatNumber(ladder[i].unwindPrice)}</td>
                    <td className="text-right">{formatPct(ladder[i].cappedIrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4">
        <SectionTitle>Option Legs</SectionTitle>
        <div className="desk-table-scroll font-ui">
          <table className="data-table-premium">
            <thead>
              <tr>
                {["Option", "Strike", "Expiry", "Original Side", "Quantity", "State", "Model Vol", "Price", "Delta", "Premium Outflow"].map((h) => (
                  <th key={h} className={h === "Option" || h === "Expiry" || h === "Original Side" || h === "State" ? undefined : "text-right"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row.legs.map((lv, i) => (
                <tr key={i} className={lv.priced.expired ? "row-display-only" : undefined}>
                  <td>{lv.leg.optionType}</td>
                  <td className="text-right">{formatNumber(lv.leg.strike, 0)}</td>
                  <td>{formatDeskDate(lv.leg.expiry)}</td>
                  <td>{lv.leg.side}</td>
                  <td className="text-right">{formatNumber(lv.leg.quantity, 0)}</td>
                  <td>{lv.priced.expired ? `Expired At ${formatNumber(lv.priced.fixing)}` : "Live"}</td>
                  <td className="text-right">{formatPct(lv.priced.modelVol)}</td>
                  <td className="text-right">{formatNumber(lv.priced.price)}</td>
                  <td className="text-right">{formatNumber(lv.priced.delta, 3)}</td>
                  <td className="text-right">{formatRupees(lv.outflow + lv.grownOutflow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export function ProductPage({ id }: { id: string }) {
  return (
    <DeskGate>
      {({ book, inputs }) => {
        const row = book.rows.find((r) => r.product.id === id);
        if (!row) {
          return (
            <Panel>
              <p className="desk-alert-error">Product Not Found In The Active Book</p>
              <Link href="/" className="mt-3 inline-block text-maroon underline">
                Back To Book Summary
              </Link>
            </Panel>
          );
        }
        return <ProductDesk key={id} book={book} row={row} inputs={inputs} />;
      }}
    </DeskGate>
  );
}
