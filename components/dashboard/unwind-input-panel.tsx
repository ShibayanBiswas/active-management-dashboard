"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import {
  FieldRow,
  FieldStack,
  GhostButton,
  Input,
  Panel,
  PrimaryButton,
  SectionTitle,
} from "@/components/layout/app-ui";
import { MultiProductCombobox } from "@/components/multi/multi-product-combobox";
import { DebentureSelect } from "@/components/ui/debenture-select";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDeskOptional } from "@/lib/context/multi-desk-provider";
import type { UnderlyingIndex } from "@/lib/types";
import { deskTodayISO, parseISODate } from "@/lib/utils";

function toDateInput(iso: string): string {
  if (!iso) return "";
  const day = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day?.[1]) return day[1];
  const parsed = parseISODate(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isToday(iso: string): boolean {
  const d = toDateInput(iso);
  return d === deskTodayISO();
}

function indexInputValue(n: number | null | undefined): string | number {
  return n != null && Number.isFinite(n) && n > 0 ? n : "";
}

function parseIndexLevel(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "—":
      return "Waiting";
    case "error":
    case "unavailable":
      return "Unavailable";
    case "missing":
      return "Missing";
    case "invalid":
      return "Invalid";
    case "prior_close":
      return "Prior Close";
    case "today_close":
      return "Today Close";
    case "last_close":
      return "Last Close";
    case "live":
    case "yahoo":
      return "Yahoo";
    case "historical":
      return "Historical";
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

export function UnwindInputPanel({ onCompute }: { onCompute?: () => void }) {
  const { product, inputs, setInputs, loading } = useDataset();
  const multi = useMultiDeskOptional();
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [marketSource, setMarketSource] = useState<string>("—");
  const [fetching, setFetching] = useState(false);
  const [sensex, setSensex] = useState<number | null>(inputs.sensex ?? null);

  useEffect(() => {
    setSensex(inputs.sensex ?? null);
  }, [inputs.sensex]);

  const applyLevels = useCallback(
    (nifty: number | null, sensexLevel: number | null, source: string) => {
      const niftyOk = nifty != null && nifty > 0;
      const sensexOk = sensexLevel != null && sensexLevel > 0;
      setSensex(sensexOk ? sensexLevel : null);
      setInputs({
        spot: niftyOk ? nifty : 0,
        nifty: niftyOk ? nifty : null,
        sensex: sensexOk ? sensexLevel : null,
      });
      setMarketSource(source);
    },
    [setInputs],
  );

  const refreshLive = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/market/levels", { cache: "no-store" });
      const data = await res.json();
      const kind =
        typeof data.spotKind === "string" && data.spotKind
          ? data.spotKind
          : typeof data.source === "string"
            ? data.source
            : "live";
      applyLevels(parseIndexLevel(data.niftyLevel), parseIndexLevel(data.sensexLevel), kind);
    } catch {
      setMarketSource("error");
    } finally {
      setFetching(false);
    }
  }, [applyLevels]);

  const resolveDate = useCallback(
    async (iso: string) => {
      const date = toDateInput(iso);
      if (!date) return;
      if (isToday(date)) {
        await refreshLive();
        return;
      }
      setFetching(true);
      try {
        const res = await fetch(`/api/market/index-at-date?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        applyLevels(
          parseIndexLevel(data.niftyLevel),
          parseIndexLevel(data.sensexLevel),
          typeof data.source === "string" ? data.source : "historical",
        );
      } catch {
        setMarketSource("error");
      } finally {
        setFetching(false);
      }
    },
    [applyLevels, refreshLive],
  );

  useEffect(() => {
    void resolveDate(inputs.unwindDate);
  }, [resolveDate, inputs.unwindDate]);

  return (
    <Panel className="input-desk-panel !p-5 sm:!p-6">
      <div className="relative z-[1] mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Input Parameters</SectionTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold/35 bg-gold/15 px-3 py-1 text-[11px] font-bold tracking-wide text-gold-dark">
            {fetching ? "Fetching…" : `Index · ${sourceLabel(marketSource)}`}
          </span>
          <GhostButton
            type="button"
            onClick={() => void resolveDate(inputs.unwindDate)}
            disabled={fetching}
          >
            <RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh Index
          </GhostButton>
        </div>
      </div>

      <FieldStack>
        <FieldRow label="Product Name" wide>
          {multi?.products.length ? (
            <div className="flex min-w-0 flex-wrap items-stretch gap-2">
              <div className="min-w-[min(100%,320px)] flex-1">
                <MultiProductCombobox
                  products={multi.products}
                  selectedKey={multi.selectedKey}
                  onSelect={multi.selectProduct}
                  disabled={loading}
                  open={productMenuOpen}
                  onOpenChange={setProductMenuOpen}
                />
              </div>
              <GhostButton
                type="button"
                className="shrink-0 self-center"
                disabled={loading}
                onClick={() => setProductMenuOpen(true)}
              >
                <Search className="h-4 w-4" />
                Select Product
              </GhostButton>
            </div>
          ) : (
            <Input
              placeholder="—"
              value={inputs.productName ?? product?.productName ?? ""}
              readOnly
              disabled={loading}
            />
          )}
        </FieldRow>
        <FieldRow label="Product Code">
          <Input
            placeholder="—"
            value={inputs.productCode ?? product?.productCode ?? ""}
            readOnly
            disabled={loading}
          />
        </FieldRow>
        <FieldRow label="Underlying">
          <select
            className="select-dark input-glow w-full cursor-pointer appearance-none rounded-2xl border border-[color:var(--ar-border)] px-4 py-3 text-sm font-semibold outline-none focus:border-gold"
            value={inputs.underlying ?? ""}
            onChange={(e) =>
              setInputs({ underlying: (e.target.value || "") as UnderlyingIndex | "" })
            }
          >
            <option value="">Choose The Value</option>
            <option value="Nifty">Nifty</option>
            <option value="Sensex">Sensex</option>
          </select>
        </FieldRow>
        <FieldRow label="Unwinding Date">
          <Input
            type="date"
            value={toDateInput(inputs.unwindDate)}
            min={product?.allotmentDate ? toDateInput(product.allotmentDate) : undefined}
            max={deskTodayISO()}
            onChange={(e) => {
              setSensex(null);
              setMarketSource("—");
              setInputs({ unwindDate: e.target.value, spot: 0, nifty: null, sensex: null });
            }}
          />
        </FieldRow>
        <FieldRow label="Bid Ask Spread">
          <Input
            type="number"
            step="0.05"
            min={0}
            suffix="%"
            value={(inputs.bidAskSpread ?? 0) * 100}
            onChange={(e) => setInputs({ bidAskSpread: (Number(e.target.value) || 0) / 100 })}
          />
        </FieldRow>
        <FieldRow label="Nifty Spot Level">
          <Input
            type="number"
            step="0.01"
            suffix="₹"
            placeholder="—"
            value={indexInputValue(inputs.nifty ?? inputs.spot)}
            onChange={(e) => {
              const v = Number(e.target.value);
              const n = Number.isFinite(v) && v > 0 ? v : 0;
              setInputs({ spot: n, nifty: n > 0 ? n : null });
            }}
          />
        </FieldRow>
        <FieldRow label="Sensex Spot Level">
          <Input
            type="number"
            step="0.01"
            suffix="₹"
            placeholder="—"
            value={indexInputValue(sensex)}
            onChange={(e) => {
              const v = Number(e.target.value);
              const n = Number.isFinite(v) && v > 0 ? v : 0;
              setSensex(n > 0 ? n : null);
              setInputs({ sensex: n > 0 ? n : null });
            }}
          />
        </FieldRow>
        <FieldRow label="Number of Debentures">
          <DebentureSelect
            value={inputs.debentures ? String(inputs.debentures) : ""}
            maxDebentures={
              product && product.faceValue > 0
                ? Math.floor(product.mobilization / product.faceValue)
                : 1_000_000
            }
            onChange={(v) =>
              setInputs({
                debentures:
                  Number(v) ||
                  (product && product.faceValue > 0
                    ? Math.round(product.mobilization / product.faceValue)
                    : 1),
              })
            }
          />
        </FieldRow>
      </FieldStack>
      {onCompute ? (
        <div className="mt-4 flex justify-end">
          <PrimaryButton type="button" onClick={onCompute}>
            Compute Unwind
          </PrimaryButton>
        </div>
      ) : null}
    </Panel>
  );
}
