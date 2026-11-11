"use client";

import { startTransition, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { LayoutGroup } from "framer-motion";
import { Search } from "lucide-react";

import { PrimaryButton, SubPageTabs } from "@/components/layout/app-ui";
import {
  PROGRESS_TAB_ORDER,
  bookTabProducts,
  progressTabCounts,
  progressTabProducts,
  revealDateRange,
  revealedProducts,
  somePassedProducts,
  type ProgressTabId,
  type RevealWindow,
} from "@/lib/multi/book-filters";
import {
  OBSERVATION_DATE_MODE_LABELS,
  OBSERVATION_DATE_MODES,
  oldestObservationYmd,
  parseObservationDateMode,
  type ObservationDateMode,
} from "@/lib/multi/observation-date-filter";
import { LIVE_OBSERVATION_TAB_ORDER, type ObservationTabId } from "@/lib/observation-tabs";
import type { ProductMaster } from "@/lib/types";
import { formatDeskDate } from "@/lib/utils";

/** One table's filter state: search, observation tab, Reveal window and progress tab, as on the Product Book. */
export function useBookFilters(products: ProductMaster[], asOf: string) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [observationTab, setObservationTab] = useState<ObservationTabId>("ongoing");
  const deferredObservationTab = useDeferredValue(observationTab);
  const [progressTab, setProgressTab] = useState<ProgressTabId>("all");
  const deferredProgressTab = useDeferredValue(progressTab);
  const [observationMode, setObservationMode] = useState<ObservationDateMode>("any");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [reveal, setReveal] = useState<RevealWindow | null>(null);

  const rangeMin = useMemo(() => oldestObservationYmd(products, asOf), [products, asOf]);
  const rangeMax = asOf;
  const range = revealDateRange(rangeMin, rangeMax, rangeStart, rangeEnd);

  const tabProducts = useMemo(
    () => bookTabProducts(products, deferredQuery, deferredObservationTab, asOf),
    [products, deferredQuery, deferredObservationTab, asOf],
  );
  const filtered = useMemo(() => revealedProducts(tabProducts, reveal), [tabProducts, reveal]);
  const somePassed = useMemo(() => somePassedProducts(products, asOf), [products, asOf]);
  const counts = useMemo(() => progressTabCounts(filtered, somePassed), [filtered, somePassed]);
  const shown = useMemo(
    () => progressTabProducts(filtered, deferredProgressTab, somePassed),
    [filtered, somePassed, deferredProgressTab],
  );

  return {
    query,
    setQuery,
    observationTab,
    selectObservationTab: (id: string) => startTransition(() => setObservationTab(id as ObservationTabId)),
    deferredObservationTab,
    progressTab,
    selectProgressTab: (id: string) => startTransition(() => setProgressTab(id as ProgressTabId)),
    deferredProgressTab,
    deferredQuery,
    observationMode,
    setObservationMode,
    rangeMin,
    rangeMax,
    rangeStart: range.start,
    rangeEnd: range.end,
    setRangeStart,
    setRangeEnd,
    reveal,
    applyReveal: () => setReveal({ mode: observationMode, start: range.start, end: range.end }),
    tabProducts,
    filtered,
    somePassed,
    counts,
    shown,
  };
}

type BookFilters = ReturnType<typeof useBookFilters>;

/** Search box with the table's buttons beside it. */
export function BookSearchRow({
  filters,
  label,
  children,
}: {
  filters: BookFilters;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[16rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
        <input
          className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
          placeholder="Search name, product code, payoff…"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          aria-label={label}
        />
      </div>
      {children}
    </div>
  );
}

/**
 * Observation Date, Start Date, End Date and Reveal, then the line saying what Reveal shows.
 * idPrefix keeps the input ids unique when two tables share the page. extra sits before Reveal.
 */
export function RevealWindowRow({
  filters,
  idPrefix,
  extra,
  note,
}: {
  filters: BookFilters;
  idPrefix: string;
  extra?: ReactNode;
  note?: string;
}) {
  const { reveal, observationMode } = filters;
  return (
    <>
      <div
        className={
          extra
            ? "mb-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,auto)_auto]"
            : "mb-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        }
      >
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor={`${idPrefix}-date-mode`}>
            Observation Date
          </label>
          <select
            id={`${idPrefix}-date-mode`}
            className="select-dark input-glow w-full cursor-pointer appearance-none rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            aria-label="Observation Date"
            value={observationMode}
            onChange={(event) => filters.setObservationMode(parseObservationDateMode(event.target.value))}
          >
            {OBSERVATION_DATE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {OBSERVATION_DATE_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor={`${idPrefix}-start-date`}>
            Start Date
          </label>
          <input
            id={`${idPrefix}-start-date`}
            className="input-glow w-full rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            type="date"
            aria-label="Start Date"
            min={filters.rangeMin}
            max={filters.rangeMax}
            value={filters.rangeStart}
            onChange={(event) => filters.setRangeStart(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor={`${idPrefix}-end-date`}>
            End Date
          </label>
          <input
            id={`${idPrefix}-end-date`}
            className="input-glow w-full rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            type="date"
            aria-label="End Date"
            min={filters.rangeStart || filters.rangeMin}
            max={filters.rangeMax}
            value={filters.rangeEnd}
            onChange={(event) => filters.setRangeEnd(event.target.value)}
          />
        </div>
        {extra}
        <PrimaryButton type="button" className="h-[3.25rem] px-6" onClick={filters.applyReveal}>
          Reveal
        </PrimaryButton>
      </div>
      <p className="-mt-2 mb-4 text-xs text-muted" aria-live="polite">
        {reveal
          ? `Showing products whose ${OBSERVATION_DATE_MODE_LABELS[reveal.mode]} falls between ${formatDeskDate(reveal.start)} and ${formatDeskDate(reveal.end)}.`
          : `Reveal shows products whose ${OBSERVATION_DATE_MODE_LABELS[observationMode]} falls between the Start Date and End Date.`}
        {note ? ` ${note}` : null}
      </p>
    </>
  );
}

/**
 * Observation tabs, then the progress tabs with their counts. Each strip in its own layout group
 * keeps its active highlight from animating across from another strip; observationGroup is left
 * out on the Product Book, as before.
 */
export function BookTabStrips({
  filters,
  observationGroup,
  progressGroup,
}: {
  filters: BookFilters;
  observationGroup?: string;
  progressGroup: string;
}) {
  const observationStrip = (
    <SubPageTabs
      tabs={[...LIVE_OBSERVATION_TAB_ORDER]}
      active={filters.observationTab}
      onSelect={filters.selectObservationTab}
    />
  );
  return (
    <>
      <div className="mb-3">
        {observationGroup ? <LayoutGroup id={observationGroup}>{observationStrip}</LayoutGroup> : observationStrip}
      </div>
      <div className="mb-3">
        <LayoutGroup id={progressGroup}>
          <SubPageTabs
            tabs={PROGRESS_TAB_ORDER.map((tab) => ({
              id: tab.id,
              label: `${tab.label} · ${filters.counts[tab.id].toLocaleString("en-IN")}`,
            }))}
            active={filters.progressTab}
            onSelect={filters.selectProgressTab}
          />
        </LayoutGroup>
      </div>
    </>
  );
}
