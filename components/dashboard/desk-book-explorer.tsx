"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Check, Database, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import { GhostButton, Panel, PrimaryButton, SectionTitle, SpecRail, SubPageTabs } from "@/components/layout/app-ui";
import { DeskDialog } from "@/components/ui/desk-dialog";
import { BID_ASK_BUCKETS, bidAskTableRows } from "@/lib/active-management/bid-ask";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDeskOptional } from "@/lib/context/multi-desk-provider";
import { DEFAULT_FWD_SELL_RATE, referenceSensexPrice, referenceUnderlyingPrice, INDEX_STRIKE_PRICE_DECIMALS } from "@/lib/engine/vol-surface";
import { OBSERVATION_TAB_ORDER, productsForObservationTab, type ObservationTabId } from "@/lib/observation-tabs";
import type { OptionLeg, ProductMaster, VolSurface } from "@/lib/types";
import { useVirtualWindow } from "@/lib/ui/use-virtual-window";
import {
  addUtcDays,
  computeGroupedRowSpans,
  computeRowSpans,
  deskBlank,
  formatDeskDate,
  formatNumber,
  deskTodayISO,
  formatPct,
  tryParseEditedDate,
  tryParseEditedNumber,
  tryParseEditedPct,
  tryParseEditedVolPoint,
  cn,
} from "@/lib/utils";
import {
  DESK_MASTER_DATE_COLS,
  DESK_MASTER_HEADERS,
  DESK_MASTER_LEG_COLS,
  DESK_MASTER_NUMERIC_COLS,
  DESK_MASTER_PCT_COLS,
  PRODUCT_MASTER_COL,
  deskColToMasterCol,
} from "@/lib/workbook/master-columns";

type ExplorerTab = "master" | "surface" | "params" | "bidask";

/** Same headers on Single and Multiple Product desks (Contingent Level omitted — equals Initial Underlying Level). */
const MASTER_HEADERS = DESK_MASTER_HEADERS;
const NUMERIC_COLS = DESK_MASTER_NUMERIC_COLS;
const PCT_COLS = DESK_MASTER_PCT_COLS;
const DATE_COLS = DESK_MASTER_DATE_COLS;
const LEG_COLS = DESK_MASTER_LEG_COLS;

/** Master columns that must be whole numbers (commas OK; no fractional part). */
const WRONG_INPUT_MESSAGE = "Wrong input. Please try again.";

type ApplyCellResult =
  | { ok: true; product: ProductMaster; display: string }
  | { ok: false; error: string };

function cloneProduct(product: ProductMaster): ProductMaster {
  return { ...product, legs: product.legs.map((leg) => ({ ...leg })) };
}

function cloneSurface(surface: VolSurface): VolSurface {
  return {
    ...surface,
    moneyness: [...surface.moneyness],
    strikes: [...surface.strikes],
    expiries: [...surface.expiries],
    volsPercent: surface.volsPercent.map((row) => [...row]),
    pricingParams: surface.pricingParams.map((point) => ({ ...point })),
  };
}

function defaultReqQuantity(product: ProductMaster, side: string, spreads: number): number {
  const sign = side.trim().toLowerCase() === "sell" ? -1 : 1;
  const initial = product.initialNiftyLevel > 0 ? product.initialNiftyLevel : 1;
  return (sign * spreads * product.mobilization) / initial / 4;
}

function blankLeg(product: ProductMaster): OptionLeg {
  const last = product.legs[product.legs.length - 1];
  const side = last?.originalSide || "Buy";
  const spreads = last?.spreads ?? 1;
  return {
    optionType: last?.optionType || "Put",
    strike: last?.strike ?? product.initialNiftyLevel,
    spreads,
    originalSide: side,
    expiry: last?.expiry || product.maturityDate,
    reqQuantity: defaultReqQuantity(product, side, spreads),
    prdPrice: last?.prdPrice ?? product.prdPrice,
  };
}

function applyMasterCell(product: ProductMaster, rowIndex: number, col: number, raw: string): ApplyCellResult {
  const next = cloneProduct(product);
  const leg = next.legs[rowIndex];
  if (!leg) return { ok: false, error: WRONG_INPUT_MESSAGE };
  const text = raw.trim();

  const takeNumber = (integer = false, allowNegative = true) =>
    tryParseEditedNumber(text, { integer, allowNegative });
  const takePct = () => tryParseEditedPct(text);
  const takeDate = () => tryParseEditedDate(text);

  switch (col) {
    case PRODUCT_MASTER_COL.productName: {
      if (!text) return { ok: false, error: WRONG_INPUT_MESSAGE };
      next.productName = text;
      return { ok: true, product: next, display: text };
    }
    case PRODUCT_MASTER_COL.tradeDate: {
      const parsed = takeDate();
      if (!parsed.ok) return parsed;
      next.tradeDate = parsed.value;
      next.deltaDate = parsed.value;
      return { ok: true, product: next, display: formatDeskDate(parsed.value) };
    }
    case PRODUCT_MASTER_COL.productCode: {
      if (!text) return { ok: false, error: WRONG_INPUT_MESSAGE };
      next.productCode = text;
      return { ok: true, product: next, display: text };
    }
    case PRODUCT_MASTER_COL.mobilization: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.mobilization = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.unwinds: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.unwinds = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.initialNiftyLevel: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.initialNiftyLevel = parsed.value;
      next.contingentLevel = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.allotmentDate: {
      const parsed = takeDate();
      if (!parsed.ok) return parsed;
      next.allotmentDate = parsed.value;
      return { ok: true, product: next, display: formatDeskDate(parsed.value) };
    }
    case PRODUCT_MASTER_COL.tenorDays: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.tenorDays = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.maturityDate: {
      const parsed = takeDate();
      if (!parsed.ok) return parsed;
      next.maturityDate = parsed.value;
      return { ok: true, product: next, display: formatDeskDate(parsed.value) };
    }
    case PRODUCT_MASTER_COL.prdDiscRate: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.prdDiscRate = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.premDiscRate: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.premDiscRate = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.formulae: {
      if (!text) return { ok: false, error: WRONG_INPUT_MESSAGE };
      next.formulae = text;
      return { ok: true, product: next, display: text };
    }
    case PRODUCT_MASTER_COL.coupon: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.coupon = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.optionType: {
      if (!text) return { ok: false, error: WRONG_INPUT_MESSAGE };
      next.legs[rowIndex] = { ...leg, optionType: text };
      return { ok: true, product: next, display: text };
    }
    case PRODUCT_MASTER_COL.strike: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.legs[rowIndex] = { ...leg, strike: parsed.value };
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.spreads: {
      const parsed = takeNumber(false, false);
      if (!parsed.ok) return parsed;
      next.legs[rowIndex] = { ...leg, spreads: parsed.value };
      return { ok: true, product: next, display: formatNumber(parsed.value, 3) };
    }
    case PRODUCT_MASTER_COL.originalSide: {
      if (!text) return { ok: false, error: WRONG_INPUT_MESSAGE };
      next.legs[rowIndex] = { ...leg, originalSide: text };
      return { ok: true, product: next, display: text };
    }
    case PRODUCT_MASTER_COL.expiry: {
      const parsed = takeDate();
      if (!parsed.ok) return parsed;
      next.legs[rowIndex] = { ...leg, expiry: parsed.value };
      return { ok: true, product: next, display: formatDeskDate(parsed.value) };
    }
    case PRODUCT_MASTER_COL.reqQuantity: {
      const parsed = takeNumber(false, true);
      if (!parsed.ok) return parsed;
      next.legs[rowIndex] = { ...leg, reqQuantity: parsed.value };
      return { ok: true, product: next, display: formatNumber(parsed.value, 2) };
    }
    case PRODUCT_MASTER_COL.prdPrice: {
      const parsed = takeNumber(false, false);
      if (!parsed.ok) return parsed;
      const patched: OptionLeg = { ...leg, prdPrice: parsed.value };
      next.legs[rowIndex] = patched;
      if (rowIndex === 0) next.prdPrice = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 2) };
    }
    case PRODUCT_MASTER_COL.inbuilt: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.inbuilt = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.tranCost: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.tranCost = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.issuanceCost: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.issuanceCost = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.marginCost: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.marginCost = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    case PRODUCT_MASTER_COL.faceValue: {
      const parsed = takeNumber(true, false);
      if (!parsed.ok) return parsed;
      next.faceValue = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 0) };
    }
    case PRODUCT_MASTER_COL.totalFundsForMargin: {
      const parsed = takeNumber(false, false);
      if (!parsed.ok) return parsed;
      next.totalFundsForMargin = parsed.value;
      return { ok: true, product: next, display: formatNumber(parsed.value, 2) };
    }
    case PRODUCT_MASTER_COL.marginFundingRate: {
      const parsed = takePct();
      if (!parsed.ok) return parsed;
      next.marginFundingRate = parsed.value;
      return { ok: true, product: next, display: formatPct(parsed.value) };
    }
    default:
      return { ok: false, error: WRONG_INPUT_MESSAGE };
  }
}

function masterRow(product: ProductMaster, legIndex: number): string[] {
  const leg = product.legs[legIndex];
  return [
    deskBlank(product.productName),
    formatDeskDate(product.tradeDate),
    deskBlank(product.productCode),
    formatNumber(product.mobilization, 0),
    formatNumber(product.unwinds, 0),
    formatNumber(product.initialNiftyLevel, 0),
    formatDeskDate(product.allotmentDate),
    formatNumber(product.tenorDays, 0),
    formatDeskDate(product.maturityDate),
    formatPct(product.prdDiscRate),
    formatPct(product.premDiscRate),
    deskBlank(product.formulae),
    formatPct(product.coupon),
    deskBlank(leg?.optionType),
    formatNumber(leg?.strike, 0),
    formatNumber(leg?.spreads, 3),
    deskBlank(leg?.originalSide),
    formatDeskDate(leg?.expiry),
    leg?.reqQuantity == null ? "-" : formatNumber(leg.reqQuantity, 2),
    leg?.prdPrice == null ? "-" : formatNumber(leg.prdPrice, 2),
    formatPct(product.inbuilt),
    formatPct(product.tranCost),
    formatPct(product.issuanceCost),
    formatPct(product.marginCost),
    formatNumber(product.faceValue, 0),
    formatNumber(product.totalFundsForMargin, 2),
    formatPct(product.marginFundingRate),
  ];
}

function SkeletonTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      <div className="h-3 w-48 animate-pulse rounded bg-gold/20" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-8 flex-1 animate-pulse rounded-lg bg-stone-200/80 dark:bg-stone-800"
              style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function productLegOffsets(products: ProductMaster[]): number[] {
  const offsets = [0];
  for (const product of products) {
    offsets.push(offsets[offsets.length - 1]! + product.legs.length);
  }
  return offsets;
}

function productIndexAtRow(offsets: number[], row: number): number {
  let lo = 0;
  let hi = Math.max(0, offsets.length - 2);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (offsets[mid]! <= row) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function strikeRupeeLabel(index: number, moneyness: number[], ref: number): string {
  if (index === 0) return "₹ 500";
  if (!(ref > 0)) return "-";
  const m = moneyness[index - 1];
  if (m == null) return "-";
  return `₹ ${formatNumber(ref * m, INDEX_STRIKE_PRICE_DECIMALS)}`;
}

function moneynessLabel(index: number, moneyness: number[]): string {
  if (index === 0) return "Deep";
  const m = moneyness[index - 1];
  if (m == null) return "-";
  return `${Math.round(m * 100)}%`;
}

/** Spread in volatility percent points, e.g. 0.75 → 0.750%. */
function spreadText(spreadPercent: number): string {
  return `${formatNumber(spreadPercent, 3)}%`;
}

/** Each surface expiry's bid ask spread and the schedule it comes from. Read only; it follows the surface. */
function BidAskSpreadTables({ surface }: { surface: VolSurface }) {
  const rows = bidAskTableRows(surface);
  return (
    <div className="min-w-0 space-y-4 p-4">
      <p className="text-xs text-muted">
        An option originally bought is priced at the surface volatility minus the spread, and one originally sold at
        the surface volatility plus the spread.
      </p>
      <div className="min-w-0">
        <p className="label-chip mb-2">Spread At Each Surface Expiry</p>
        <div className="desk-table-scroll">
          <table className="data-table-premium data-table-fill text-sm">
            <thead>
              <tr>
                <th className="col-pinned whitespace-nowrap px-3 py-2 text-left">Option Expiry Date</th>
                <th className="whitespace-nowrap px-3 py-2 text-left">Bid Ask Spread</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-muted" colSpan={2}>
                    The Volatility Surface has no expiries.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`bid-ask-${i}-${row.expiry}`} className={i % 2 === 1 ? "data-table-row-alt" : undefined}>
                    <td className="col-pinned whitespace-nowrap px-3 py-2 font-semibold">{formatDeskDate(row.expiry)}</td>
                    <td className="cell-value px-3 py-2 tabular-nums">{spreadText(row.spreadPercent)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="min-w-0">
        <p className="label-chip mb-2">Bucket Schedule</p>
        <div className="desk-table-scroll">
          <table className="data-table-premium data-table-fill text-sm">
            <thead>
              <tr>
                <th className="col-pinned whitespace-nowrap px-3 py-2 text-left">Option Expiry</th>
                <th className="whitespace-nowrap px-3 py-2 text-left">Bid Ask Spread</th>
              </tr>
            </thead>
            <tbody>
              {BID_ASK_BUCKETS.map((bucket, i) => {
                const previous = BID_ASK_BUCKETS[i - 1]?.through;
                const label =
                  bucket.through != null
                    ? `Through ${formatDeskDate(bucket.through)}`
                    : previous
                      ? `After ${formatDeskDate(previous)}`
                      : "Every Expiry";
                return (
                  <tr key={`bucket-${i}`} className={i % 2 === 1 ? "data-table-row-alt" : undefined}>
                    <td className="col-pinned whitespace-nowrap px-3 py-2 font-semibold">{label}</td>
                    <td className="cell-value px-3 py-2 tabular-nums">{spreadText(bucket.spreadPercent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VolSurfaceGrid({
  surface,
  editing,
  cellDraft,
  onCellDraft,
  onChange,
  onInvalid,
}: {
  surface: VolSurface;
  editing: boolean;
  cellDraft: Record<string, string>;
  onCellDraft: (key: string, raw: string) => void;
  onChange: (next: VolSurface) => void;
  onInvalid: (message: string) => void;
}) {
  const colCount = Math.max(1 + surface.moneyness.length, surface.volsPercent[0]?.length ?? 0);
  const colIndexes = Array.from({ length: colCount }, (_, i) => i);
  // Every vol point prints in its own cell; repeated values down a column are not merged.
  const niftyRef = referenceUnderlyingPrice(surface);
  const sensexRef = referenceSensexPrice(surface);
  const inputClass =
    "w-full min-w-[4.5rem] rounded border border-gold/40 bg-transparent px-1.5 py-1 text-center text-sm outline-none focus:border-gold";

  function commitMoneyness(index: number, key: string, raw: string, fallback: string) {
    if (index <= 0) return;
    const parsed = tryParseEditedPct(raw);
    if (!parsed.ok || !(parsed.value > 0)) {
      onInvalid(WRONG_INPUT_MESSAGE);
      onCellDraft(key, fallback);
      return;
    }
    const next = cloneSurface(surface);
    next.moneyness[index - 1] = parsed.value;
    next.strikes = [500, ...next.moneyness];
    onChange(next);
    onCellDraft(key, `${Math.round(parsed.value * 100)}%`);
  }

  function commitExpiry(row: number, key: string, raw: string, fallback: string) {
    const parsed = tryParseEditedDate(raw);
    if (!parsed.ok) {
      onInvalid(WRONG_INPUT_MESSAGE);
      onCellDraft(key, fallback);
      return;
    }
    const next = cloneSurface(surface);
    next.expiries[row] = parsed.value;
    onChange(next);
    onCellDraft(key, formatDeskDate(parsed.value));
  }

  function commitVol(row: number, col: number, key: string, raw: string, fallback: string) {
    const parsed = tryParseEditedVolPoint(raw);
    if (!parsed.ok) {
      onInvalid(WRONG_INPUT_MESSAGE);
      onCellDraft(key, fallback);
      return;
    }
    const next = cloneSurface(surface);
    if (!next.volsPercent[row]) next.volsPercent[row] = Array.from({ length: colCount }, () => 0);
    next.volsPercent[row][col] = parsed.value;
    onChange(next);
    onCellDraft(key, formatNumber(parsed.value, 2));
  }

  function addExpiry() {
    const next = cloneSurface(surface);
    const last = next.expiries[next.expiries.length - 1] ?? new Date().toISOString();
    const lastVols = next.volsPercent[next.volsPercent.length - 1] ?? Array.from({ length: colCount }, () => 0);
    next.expiries.push(addUtcDays(last, 28));
    next.volsPercent.push([...lastVols]);
    onChange(next);
  }

  function removeExpiry(row: number) {
    if (surface.expiries.length <= 1) return;
    const next = cloneSurface(surface);
    next.expiries.splice(row, 1);
    next.volsPercent.splice(row, 1);
    onChange(next);
  }

  function addStrikeColumn() {
    const next = cloneSurface(surface);
    const last = next.moneyness[next.moneyness.length - 1] ?? 1;
    next.moneyness.push(Math.round((last + 0.05) * 100) / 100);
    next.strikes = [500, ...next.moneyness];
    next.volsPercent = next.volsPercent.map((row) => [...row, row[row.length - 1] ?? 0]);
    onChange(next);
  }

  function removeStrikeColumn(index: number) {
    if (index <= 0 || surface.moneyness.length <= 1) return;
    const next = cloneSurface(surface);
    next.moneyness.splice(index - 1, 1);
    next.strikes = [500, ...next.moneyness];
    next.volsPercent = next.volsPercent.map((row) => {
      const copy = [...row];
      copy.splice(index, 1);
      return copy;
    });
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <GhostButton type="button" className="!px-3 !py-1.5 text-xs" onClick={addExpiry}>
            <Plus className="h-3.5 w-3.5" />
            Add Expiry Row
          </GhostButton>
          <GhostButton type="button" className="!px-3 !py-1.5 text-xs" onClick={addStrikeColumn}>
            <Plus className="h-3.5 w-3.5" />
            Add Strike Column
          </GhostButton>
        </div>
      ) : null}
      {niftyRef > 0 || sensexRef > 0 ? (
        <p className="px-4 pt-3 text-xs text-muted">
          {niftyRef > 0 ? `Reference Nifty Price · ₹ ${formatNumber(niftyRef, INDEX_STRIKE_PRICE_DECIMALS)}` : null}
          {niftyRef > 0 && sensexRef > 0 ? " · " : null}
          {sensexRef > 0 ? `Reference Sensex Price · ₹ ${formatNumber(sensexRef, INDEX_STRIKE_PRICE_DECIMALS)}` : null}
        </p>
      ) : null}
      <div className="desk-table-scroll">
        <table className="data-table-premium data-table-fill vol-grid text-sm">
          <thead>
            <tr>
              <th className="col-pinned whitespace-nowrap px-3 py-2 text-left">Strike Change</th>
              {colIndexes.map((i) => (
                <th key={`chg-${i}`} className="whitespace-nowrap px-3 py-2 text-center">
                  {i === 0 ? (
                    "Deep · ₹500"
                  ) : editing ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        className={inputClass}
                        value={cellDraft[`m-${i}`] ?? moneynessLabel(i, surface.moneyness)}
                        aria-label={`Strike change ${i}`}
                        onChange={(e) => onCellDraft(`m-${i}`, e.target.value)}
                        onBlur={(e) =>
                          commitMoneyness(
                            i,
                            `m-${i}`,
                            e.target.value,
                            moneynessLabel(i, surface.moneyness),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-maroon"
                        aria-label="Remove strike column"
                        disabled={surface.moneyness.length <= 1}
                        onClick={() => removeStrikeColumn(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    moneynessLabel(i, surface.moneyness)
                  )}
                </th>
              ))}
              {editing ? <th className="whitespace-nowrap px-3 py-2 text-center">Row</th> : null}
            </tr>
            <tr>
              <th className="col-pinned whitespace-nowrap px-3 py-2 text-left">Nifty Strikes</th>
              {colIndexes.map((i) => (
                <th key={`nifty-${i}`} className="whitespace-nowrap px-3 py-2 text-center text-xs font-normal">
                  {strikeRupeeLabel(i, surface.moneyness, niftyRef)}
                </th>
              ))}
              {editing ? <th className="px-3 py-2" aria-hidden> </th> : null}
            </tr>
            <tr>
              <th className="col-pinned whitespace-nowrap px-3 py-2 text-left">Sensex Strikes</th>
              {colIndexes.map((i) => (
                <th key={`sensex-${i}`} className="whitespace-nowrap px-3 py-2 text-center text-xs font-normal">
                  {strikeRupeeLabel(i, surface.moneyness, sensexRef)}
                </th>
              ))}
              {editing ? <th className="px-3 py-2" aria-hidden> </th> : null}
            </tr>
            <tr>
              <th className="col-pinned vol-expiry-head whitespace-nowrap px-3 py-2 text-left">Expiry Date</th>
              {colIndexes.map((i) => (
                <th key={`exp-h-${i}`} className="px-3 py-2" aria-hidden>
                  {" "}
                </th>
              ))}
              {editing ? <th className="px-3 py-2" aria-hidden> </th> : null}
            </tr>
          </thead>
          <tbody>
            {surface.expiries.map((expiry, ri) => (
              <tr key={`vol-${ri}-${expiry}`} className={ri % 2 === 1 ? "data-table-row-alt" : undefined}>
                <td className="col-pinned vol-expiry-cell px-3 py-2 text-left font-semibold whitespace-nowrap">
                  {editing ? (
                    <input
                      className={`${inputClass} text-left`}
                      value={cellDraft[`e-${ri}`] ?? formatDeskDate(expiry)}
                      aria-label={`Expiry ${ri + 1}`}
                      placeholder="11-Aug-26"
                      onChange={(e) => onCellDraft(`e-${ri}`, e.target.value)}
                      onBlur={(e) =>
                        commitExpiry(ri, `e-${ri}`, e.target.value, formatDeskDate(expiry))
                      }
                    />
                  ) : (
                    formatDeskDate(expiry)
                  )}
                </td>
                {colIndexes.map((ci) => {
                  return (
                  <td
                    key={`${ri}-${ci}`}
                    className="cell-value align-top text-center tabular-nums"
                  >
                    {editing ? (
                      <input
                        className={inputClass}
                        value={
                          cellDraft[`v-${ri}-${ci}`] ??
                          formatNumber(surface.volsPercent[ri]?.[ci] ?? null, 2)
                        }
                        aria-label={`Volatility ${ri + 1} ${ci}`}
                        inputMode="decimal"
                        onChange={(e) => onCellDraft(`v-${ri}-${ci}`, e.target.value)}
                        onBlur={(e) =>
                          commitVol(
                            ri,
                            ci,
                            `v-${ri}-${ci}`,
                            e.target.value,
                            formatNumber(surface.volsPercent[ri]?.[ci] ?? null, 2),
                          )
                        }
                      />
                    ) : (
                      formatNumber(surface.volsPercent[ri]?.[ci] ?? null, 2)
                    )}
                  </td>
                  );
                })}
                {editing ? (
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:text-maroon"
                      aria-label="Remove expiry row"
                      disabled={surface.expiries.length <= 1}
                      onClick={() => removeExpiry(ri)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DeskBookExplorer({
  title = "Desk Book",
  kicker,
}: {
  title?: string;
  kicker?: string;
}) {
  const { product, surface, loading, saveProduct, saveSurface, refresh } = useDataset();
  const multi = useMultiDeskOptional();
  const [tab, setTab] = useState<ExplorerTab>("master");
  const [observationTab, setObservationTab] = useState<ObservationTabId>("ongoing");
  const deferredObservationTab = useDeferredValue(observationTab);
  const [draft, setDraft] = useState<ProductMaster | null>(null);
  const [surfaceDraft, setSurfaceDraft] = useState<VolSurface | null>(null);
  const [cellDraft, setCellDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [masterQuery, setMasterQuery] = useState("");
  const deferredMasterQuery = useDeferredValue(masterQuery);

  const editingMaster = draft != null;
  const editingSurface = surfaceDraft != null;
  const editing = editingMaster || editingSurface;
  const displayProduct = draft ?? product;
  const displaySurface = surfaceDraft ?? surface;
  const surfaceBookSig = surface
    ? `${surface.monthKey}|${surface.expiries.length}|${surface.pricingParams?.[0]?.fwdSellRate ?? ""}|${surface.pricingParams?.[0]?.volBump ?? ""}|${surface.referenceUnderlyingPrice ?? ""}|${surface.referenceSensexPrice ?? ""}|${surface.volsPercent[0]?.[0] ?? ""}`
    : "";

  useEffect(() => {
    // Upload / server refresh replaced the live surface — drop stale local surface edits.
    setSurfaceDraft(null);
  }, [surfaceBookSig]);

  const bookProducts = useMemo(() => {
    if (editingMaster && displayProduct) return [displayProduct];
    const asOf = multi?.asOfToday || deskTodayISO();
    const source = (() => {
      if (multi) {
        const pool =
          deferredObservationTab === "expired"
            ? multi.allProducts
            : multi.products;
        if (!pool.length && !multi.allProducts.length) {
          return displayProduct ? [displayProduct] : [];
        }
        const needle = deferredMasterQuery.trim().toLowerCase();
        const matched = needle
          ? pool.filter((item) =>
              [item.productName, item.productCode].some((value) => String(value).toLowerCase().includes(needle)),
            )
          : pool;
        return matched.length ? matched : [];
      }
      return displayProduct ? [displayProduct] : [];
    })();
    if (editingMaster || !multi) return source;
    return productsForObservationTab(source, deferredObservationTab, asOf);
  }, [editingMaster, displayProduct, multi, deferredMasterQuery, deferredObservationTab]);

  const isMultiBook = Boolean(multi && (multi.products.length || multi.allProducts.length));
  const showSerial = isMultiBook && !editingMaster;
  const lazyMultiMaster = showSerial && !editingMaster;

  const legOffsets = useMemo(
    () => (lazyMultiMaster ? productLegOffsets(bookProducts) : [0]),
    [bookProducts, lazyMultiMaster],
  );
  const masterRowCount = lazyMultiMaster
    ? (legOffsets[legOffsets.length - 1] ?? 0)
    : bookProducts.reduce((sum, item) => sum + item.legs.length, 0);

  const masterMatrix = useMemo(() => {
    if (lazyMultiMaster) return [] as string[][];
    return bookProducts.flatMap((item, productIndex) =>
      item.legs.map((_, i) => {
        const row = masterRow(item, i);
        return showSerial ? [String(productIndex + 1), ...row] : row;
      }),
    );
  }, [bookProducts, lazyMultiMaster, showSerial]);
  const masterHeaders = showSerial ? (["Sr. No.", ...MASTER_HEADERS] as const) : MASTER_HEADERS;
  const masterHeaderAt = (deskCol: number) =>
    showSerial && deskCol === 0 ? "Sr. No." : MASTER_HEADERS[showSerial ? deskCol - 1 : deskCol] ?? "";
  const ready = Boolean(product && surface) && !loading;
  const param = displaySurface?.pricingParams[0];
  const monthLabel = displaySurface?.label.replace(" Volatility Surface", "") ?? "-";
  const masterScrollerRef = useRef<HTMLDivElement>(null);
  const virtualizeMaster = lazyMultiMaster && masterRowCount > 80;
  const masterVirtual = useVirtualWindow(
    virtualizeMaster ? masterRowCount : 0,
    45,
    masterScrollerRef,
    12,
  );
  const productWindow = useMemo(() => {
    if (!lazyMultiMaster || masterRowCount === 0) {
      return { rowStart: 0, rowEnd: 0 };
    }
    if (!virtualizeMaster) return { rowStart: 0, rowEnd: masterRowCount };
    return {
      rowStart: Math.max(0, Math.min(masterVirtual.start, masterRowCount)),
      rowEnd: Math.max(0, Math.min(masterVirtual.end, masterRowCount)),
    };
  }, [lazyMultiMaster, virtualizeMaster, masterRowCount, masterVirtual.start, masterVirtual.end]);

  const lazySlice = useMemo(() => {
    if (!lazyMultiMaster) return { rows: [] as string[][] };
    const rows: string[][] = [];
    for (let row = productWindow.rowStart; row < productWindow.rowEnd; row += 1) {
      const productIndex = productIndexAtRow(legOffsets, row);
      const item = bookProducts[productIndex];
      if (!item) continue;
      const legIndex = row - (legOffsets[productIndex] ?? 0);
      rows.push([String(productIndex + 1), ...masterRow(item, legIndex)]);
    }
    return { rows };
  }, [lazyMultiMaster, bookProducts, legOffsets, productWindow.rowStart, productWindow.rowEnd]);

  const singleSpans = useMemo(() => {
    if (lazyMultiMaster) return [] as number[][];
    if (editingMaster) return masterMatrix.map((row) => row.map(() => 1));
    if (showSerial) {
      const colCount = masterMatrix[0]?.length ?? 0;
      const mergeCols = Array.from({ length: colCount }, (_, i) => i);
      return computeGroupedRowSpans(masterMatrix, mergeCols, 0);
    }
    return computeRowSpans(masterMatrix);
  }, [lazyMultiMaster, editingMaster, masterMatrix, showSerial]);

  const masterVisible = lazyMultiMaster ? lazySlice.rows : masterMatrix;
  const masterSpans = useMemo(() => {
    if (!lazyMultiMaster) return singleSpans;
    const colCount = masterVisible[0]?.length ?? 0;
    if (colCount === 0) return [] as number[][];
    return computeGroupedRowSpans(
      masterVisible,
      Array.from({ length: colCount }, (_, index) => index),
      0,
    );
  }, [lazyMultiMaster, masterVisible, singleSpans]);
  const masterStart = lazyMultiMaster ? productWindow.rowStart : 0;
  const masterEnd = lazyMultiMaster ? productWindow.rowEnd : masterMatrix.length;
  const masterOffsetY = virtualizeMaster ? productWindow.rowStart * masterVirtual.rowHeight : 0;

  useEffect(() => {
    const el = masterScrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [deferredObservationTab, deferredMasterQuery]);

  function clearEdits() {
    setDraft(null);
    setSurfaceDraft(null);
    setCellDraft({});
  }

  /** Discard drafts and reload Product Master + Vol Surface + Surface Params from the server. */
  async function resetDeskBookToServer() {
    setRefreshing(true);
    try {
      clearEdits();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function commitEdits() {
    setSaving(true);
    setSaveNotice(null);
    try {
      let sessionOnly = false;
      if (draft) {
        const payload = cloneProduct(draft);
        if (payload.initialNiftyLevel > 0) {
          payload.contingentLevel = payload.initialNiftyLevel;
        }
        const { persisted } = await saveProduct(payload);
        if (!persisted) sessionOnly = true;
      }
      if (surfaceDraft) {
        const { persisted } = await saveSurface(surfaceDraft);
        if (!persisted) sessionOnly = true;
      }
      // Keep the saved book in React state from saveProduct/saveSurface.
      // Do not refresh here — a stale API round-trip was wiping edits after Save.
      clearEdits();
      if (sessionOnly) {
        setSaveNotice(
          "Saved on this screen only. A refresh loads the stored book.",
        );
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "The desk book could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function commitMasterInput(rowIndex: number, deskCol: number, masterCol: number, raw: string, fallback: string) {
    if (!draft || masterCol < 0) return;
    const key = `${rowIndex}-${deskCol}`;
    const result = applyMasterCell(draft, rowIndex, masterCol, raw);
    if (!result.ok) {
      setEditError(result.error);
      setCellDraft((draftMap) => ({
        ...draftMap,
        [key]: fallback === "—" || fallback === "-" ? "" : fallback,
      }));
      return;
    }
    setDraft(result.product);
    setCellDraft((draftMap) => ({ ...draftMap, [key]: result.display }));
  }

  return (
    <Panel className="min-w-0 !overflow-hidden !p-0 sm:!p-0">
      <div className="border-b border-[color:var(--ar-border)] px-4 py-3">
        <SectionTitle icon={Database}>{title}</SectionTitle>
        <p className="text-xs text-muted">
          {kicker ??
            (editingMaster
              ? `${masterRowCount} legs. Save to update the quote.`
              : editingSurface
                ? `${displaySurface?.expiries.length ?? 0} expiries. Save to update the marks.`
                : `${masterRowCount} legs.`)}
        </p>
        {multi?.products?.length && tab === "master" && !editingMaster ? (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
            <input
              className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
              placeholder="Search name, product code…"
              value={masterQuery}
              onChange={(e) => setMasterQuery(e.target.value)}
            />
          </div>
        ) : null}
        {isMultiBook && tab === "master" && !editingMaster ? (
          <div className="mt-3">
            <SubPageTabs
              tabs={[...OBSERVATION_TAB_ORDER]}
              active={observationTab}
              onSelect={(id) => {
                startTransition(() => setObservationTab(id as ObservationTabId));
              }}
            />
          </div>
        ) : null}
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <SubPageTabs
            tabs={[
              { id: "master", label: "Product Master" },
              { id: "surface", label: "Volatility Surface" },
              { id: "params", label: "Surface Parameters" },
              { id: "bidask", label: "Bid Ask Spread" },
            ]}
            active={tab}
            onSelect={(id) => {
              const next = id as ExplorerTab;
              if (editingMaster && next !== "master") return;
              if (editingSurface && next === "master") return;
              setTab(next);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <PrimaryButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={saving}
                  onClick={() => void commitEdits()}
                >
                  <Check className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save Changes"}
                </PrimaryButton>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={saving}
                  onClick={clearEdits}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </GhostButton>
              </>
            ) : tab === "master" && product && !multi?.products?.length ? (
              <>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setDraft(cloneProduct(product));
                    setCellDraft({});
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Product Master
                </GhostButton>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={refreshing || saving}
                  onClick={() => void resetDeskBookToServer()}
                  title="Reload the book"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </GhostButton>
              </>
            ) : isMultiBook && tab === "master" ? (
              <GhostButton
                type="button"
                className="!px-3 !py-1.5 text-xs"
                disabled={refreshing || saving}
                onClick={() => void resetDeskBookToServer()}
                title="Reload the book"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </GhostButton>
            ) : (tab === "surface" || tab === "params") && surface && !isMultiBook ? (
              <>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setSurfaceDraft(cloneSurface(surface));
                    setCellDraft({});
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Volatility Surface
                </GhostButton>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={refreshing || saving}
                  onClick={() => void resetDeskBookToServer()}
                  title="Reload the book"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </GhostButton>
              </>
            ) : (tab === "surface" || tab === "params") && surface ? (
              <>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setSurfaceDraft(cloneSurface(surface));
                    setCellDraft({});
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Volatility Surface
                </GhostButton>
                <GhostButton
                  type="button"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={refreshing || saving}
                  onClick={() => void resetDeskBookToServer()}
                  title="Reload the book"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </GhostButton>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {!ready ? (
        <SkeletonTable rows={tab === "surface" ? 12 : 10} cols={tab === "surface" ? 10 : 8} />
      ) : null}

      {ready && tab === "master" && (displayProduct || Boolean(multi?.products?.length)) ? (
        <>
        {multi?.products?.length && !editingMaster ? (
          <p className="mb-3 text-xs text-muted">
            {bookProducts.length} of {multi.products.length} products · {masterRowCount} {masterRowCount === 1 ? "option row" : "option rows"}
          </p>
        ) : null}
        <div
          ref={masterScrollerRef}
          className={cn("desk-table-scroll", Boolean(multi?.products?.length) && "desk-table-scroll--book")}
          onScroll={virtualizeMaster ? masterVirtual.onScroll : undefined}
        >
          <table className="data-table-premium data-table-fill text-sm">
            <thead>
              <tr>
                {masterHeaders.map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-left",
                      i === 0 && "col-pinned",
                      i === 0 && showSerial && "col-serial",
                      showSerial && i === 1 && "col-pinned-2",
                    )}
                  >
                    {h}
                  </th>
                ))}
                {editingMaster ? <th className="whitespace-nowrap px-3 py-2 text-center">Row</th> : null}
              </tr>
            </thead>
            <tbody>
              {masterRowCount === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-muted" colSpan={masterHeaders.length}>
                    No products match this search.
                  </td>
                </tr>
              ) : null}
              {virtualizeMaster && masterOffsetY > 0 ? (
                <tr aria-hidden className="virtual-spacer">
                  <td
                    colSpan={masterHeaders.length + (editingMaster ? 1 : 0)}
                    style={{ height: masterOffsetY, padding: 0, border: 0 }}
                  />
                </tr>
              ) : null}
              {masterVisible.map((row, localIndex) => {
                const ri = masterStart + localIndex;
                const spanRow = lazyMultiMaster ? localIndex : ri;
                return (
                <tr
                  key={`master-${ri}`}
                  className={cn(ri % 2 === 1 && "data-table-row-alt")}
                >
                  {row.map((value, ci) => {
                    const span = masterSpans[spanRow]?.[ci] ?? 1;
                    if (span === 0) return null;
                    const sourceCol = showSerial ? ci - 1 : ci;
                    const headerLabel = masterHeaderAt(ci);
                    const productLevelLocked =
                      editingMaster && sourceCol >= 0 && !LEG_COLS.has(sourceCol) && ri > 0;
                    const isNumeric =
                      sourceCol >= 0 && (NUMERIC_COLS.has(sourceCol) || PCT_COLS.has(sourceCol));
                    const masterCol = sourceCol >= 0 ? deskColToMasterCol(sourceCol) : -1;
                    return (
                      <td
                        key={`${ri}-${ci}`}
                        rowSpan={span > 1 ? span : undefined}
                        className={cn(
                          "px-3 py-2 align-top",
                          ci === 0 && "col-pinned font-semibold",
                          ci === 0 && showSerial && "col-serial",
                          showSerial && ci === 1 && "col-pinned-2 font-semibold",
                          masterCol === PRODUCT_MASTER_COL.formulae && "whitespace-nowrap text-xs",
                          isNumeric && "cell-value tabular-nums",
                          masterCol !== PRODUCT_MASTER_COL.formulae && !isNumeric && "whitespace-nowrap",
                        )}
                      >
                        {editingMaster && draft && !productLevelLocked ? (
                          <input
                            className="w-full min-w-[7rem] rounded border border-gold/40 bg-transparent px-1.5 py-1 text-sm outline-none focus:border-gold"
                            value={cellDraft[`${ri}-${ci}`] ?? (value === "—" || value === "-" ? "" : value)}
                            aria-label={headerLabel}
                            inputMode={isNumeric ? "decimal" : undefined}
                            placeholder={DATE_COLS.has(sourceCol) ? "11-Aug-26" : undefined}
                            onChange={(e) => {
                              setCellDraft((prev) => ({ ...prev, [`${ri}-${ci}`]: e.target.value }));
                            }}
                            onBlur={(e) => {
                              if (masterCol < 0) return;
                              commitMasterInput(ri, ci, masterCol, e.target.value, value);
                            }}
                          />
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                  {editingMaster && draft ? (
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-maroon"
                        aria-label="Remove option leg"
                        disabled={draft.legs.length <= 1}
                        onClick={() =>
                          setDraft((prev) => {
                            if (!prev || prev.legs.length <= 1) return prev;
                            const next = cloneProduct(prev);
                            next.legs.splice(ri, 1);
                            return next;
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
                );
              })}
              {virtualizeMaster && masterEnd < masterRowCount ? (
                <tr aria-hidden className="virtual-spacer">
                  <td
                    colSpan={masterHeaders.length + (editingMaster ? 1 : 0)}
                    style={{
                      height: Math.max(0, masterVirtual.totalHeight - masterEnd * masterVirtual.rowHeight),
                      padding: 0,
                      border: 0,
                    }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
          {editingMaster && draft ? (
            <div className="px-4 py-3">
              <GhostButton
                type="button"
                className="!px-3 !py-1.5 text-xs"
                onClick={() =>
                  setDraft((prev) => {
                    if (!prev) return prev;
                    const next = cloneProduct(prev);
                    next.legs.push(blankLeg(next));
                    return next;
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add Option Leg
              </GhostButton>
            </div>
          ) : null}
        </div>
        </>
      ) : null}

      {ready && tab === "surface" && displaySurface ? (
        <VolSurfaceGrid
          surface={displaySurface}
          editing={editingSurface}
          cellDraft={cellDraft}
          onCellDraft={(key, raw) => setCellDraft((prev) => ({ ...prev, [key]: raw }))}
          onChange={setSurfaceDraft}
          onInvalid={setEditError}
        />
      ) : null}

      {ready && tab === "bidask" && displaySurface ? <BidAskSpreadTables surface={displaySurface} /> : null}

      {ready && tab === "params" && displaySurface ? (
        <div className="min-w-0 space-y-4 p-4">
          <SpecRail
            cards={[
              { label: "Surface Month", value: monthLabel },
              { label: "Expiries Tracked", value: String(displaySurface.expiries.length) },
              { label: "Strike Columns", value: String(displaySurface.strikes.length) },
              {
                label: "Reference Nifty Price",
                value: referenceUnderlyingPrice(displaySurface) > 0 ? `₹ ${formatNumber(referenceUnderlyingPrice(displaySurface), INDEX_STRIKE_PRICE_DECIMALS)}` : "-",
              },
              {
                label: "Reference Sensex Price",
                value: referenceSensexPrice(displaySurface) > 0 ? `₹ ${formatNumber(referenceSensexPrice(displaySurface), INDEX_STRIKE_PRICE_DECIMALS)}` : "-",
              },
              { label: "Volatility Bump", value: formatPct(param?.volBump ?? 0) },
              { label: "Forward Sell Rate", value: formatPct(param?.fwdSellRate ?? DEFAULT_FWD_SELL_RATE) },
              { label: "Deep Strike", value: "₹ 500" },
            ]}
          />
          <div className="w-full min-w-0">
            <table className="data-table-premium data-table-fill text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Parameter</th>
                  <th className="px-3 py-2 text-left">Value</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Month", monthLabel, null],
                    [
                      "Reference Nifty Price",
                      referenceUnderlyingPrice(displaySurface) > 0
                        ? `₹ ${formatNumber(referenceUnderlyingPrice(displaySurface), INDEX_STRIKE_PRICE_DECIMALS)}`
                        : "-",
                      "referenceUnderlyingPrice",
                    ],
                    [
                      "Reference Sensex Price",
                      referenceSensexPrice(displaySurface) > 0
                        ? `₹ ${formatNumber(referenceSensexPrice(displaySurface), INDEX_STRIKE_PRICE_DECIMALS)}`
                        : "-",
                      "referenceSensexPrice",
                    ],
                    ["Volatility Bump", formatPct(param?.volBump ?? 0), "volBump"],
                    ["Forward Sell Rate", formatPct(param?.fwdSellRate ?? DEFAULT_FWD_SELL_RATE), "fwdSellRate"],
                    ["Deep Strike", "₹ 500", null],
                  ] as Array<[string, string, "volBump" | "fwdSellRate" | "referenceUnderlyingPrice" | "referenceSensexPrice" | null]>
                ).map(([label, value, field], i) => (
                  <tr key={label} className={i % 2 ? "data-table-row-alt" : undefined}>
                    <td className="px-3 py-2 font-semibold">{label}</td>
                    <td className="cell-value px-3 py-2">
                      {editingSurface && field ? (
                        <input
                          className="w-full min-w-[7rem] rounded border border-gold/40 bg-transparent px-1.5 py-1 text-sm outline-none focus:border-gold"
                          value={cellDraft[`p-${field}`] ?? value}
                          aria-label={label}
                          inputMode="decimal"
                          onChange={(e) => {
                            setCellDraft((prev) => ({ ...prev, [`p-${field}`]: e.target.value }));
                          }}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const key = `p-${field}`;
                            setSurfaceDraft((prev) => {
                              if (!prev) return prev;
                              const next = cloneSurface(prev);
                              if (field === "referenceUnderlyingPrice" || field === "referenceSensexPrice") {
                                const parsed = tryParseEditedNumber(raw, { allowNegative: false });
                                if (!parsed.ok || !(parsed.value > 0)) {
                                  setEditError(WRONG_INPUT_MESSAGE);
                                  setCellDraft((map) => ({ ...map, [key]: value }));
                                  return prev;
                                }
                                if (field === "referenceUnderlyingPrice") {
                                  next.referenceUnderlyingPrice = parsed.value;
                                } else {
                                  next.referenceSensexPrice = parsed.value;
                                }
                                setCellDraft((map) => ({
                                  ...map,
                                  [key]: `₹ ${formatNumber(parsed.value, INDEX_STRIKE_PRICE_DECIMALS)}`,
                                }));
                                return next;
                              }
                              const parsed = tryParseEditedPct(raw);
                              if (!parsed.ok) {
                                setEditError(WRONG_INPUT_MESSAGE);
                                setCellDraft((map) => ({ ...map, [key]: value }));
                                return prev;
                              }
                              next.pricingParams = next.pricingParams.map((point) => ({
                                ...point,
                                volBump: field === "volBump" ? parsed.value : point.volBump,
                                fwdSellRate: field === "fwdSellRate" ? parsed.value : point.fwdSellRate,
                              }));
                              if (!next.pricingParams.length) {
                                next.pricingParams = [
                                  {
                                    date: next.expiries[0] ?? new Date().toISOString(),
                                    volBump: field === "volBump" ? parsed.value : 0,
                                    fwdSellRate: field === "fwdSellRate" ? parsed.value : DEFAULT_FWD_SELL_RATE,
                                  },
                                ];
                              }
                              setCellDraft((map) => ({ ...map, [key]: formatPct(parsed.value) }));
                              return next;
                            });
                          }}
                        />
                      ) : (
                        value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <DeskDialog
        open={Boolean(saveNotice)}
        tone="success"
        title="Saved With Limited Persistence"
        onClose={() => setSaveNotice(null)}
      >
        <p>{saveNotice}</p>
      </DeskDialog>

      <DeskDialog
        open={Boolean(editError)}
        tone="error"
        title={editError === WRONG_INPUT_MESSAGE ? "Wrong Input" : "Save Failed"}
        onClose={() => setEditError(null)}
      >
        <p>
          {editError === WRONG_INPUT_MESSAGE
            ? "That value is not valid for this cell. Commas and one decimal are fine — please try again."
            : "The desk book could not be saved. Check the values and try again."}
        </p>
        {editError && editError !== WRONG_INPUT_MESSAGE ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-maroon dark:text-gold">
            <li>{editError}</li>
          </ul>
        ) : null}
      </DeskDialog>
    </Panel>
  );
}
