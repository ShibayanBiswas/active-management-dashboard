"use client";

import { useState, type FormEvent } from "react";

import { GhostButton, Input, PrimaryButton } from "@/components/layout/app-ui";
import { useMultiQuotes } from "@/lib/context/multi-desk-provider";
import { INDEX_STRIKE_PRICE_DECIMALS } from "@/lib/engine/vol-surface";
import { formatNumber, tryParseEditedNumber } from "@/lib/utils";

/** Blank is the desk level (null). Anything else must be a positive number. */
function parseLevel(raw: string): { ok: true; value: number | null } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: null };
  const parsed = tryParseEditedNumber(raw, { allowNegative: false });
  return parsed.ok && parsed.value > 0 ? { ok: true, value: parsed.value } : { ok: false };
}

function levelText(level: number | null): string {
  return level == null ? "" : String(level);
}

/**
 * Assumed Nifty Level and Assumed Sensex Level for Expected Internal Rate of Return.
 * Applying re-quotes the whole book, so it only runs on Apply or Reset, never per keystroke.
 */
export function AssumedLevelInputs() {
  const { assumedLevels, setAssumedLevels, deskLevels } = useMultiQuotes();
  const [nifty, setNifty] = useState(() => levelText(assumedLevels.nifty));
  const [sensex, setSensex] = useState(() => levelText(assumedLevels.sensex));

  const niftyLevel = parseLevel(nifty);
  const sensexLevel = parseLevel(sensex);
  const error = !niftyLevel.ok
    ? "Assumed Nifty Level must be a positive number."
    : !sensexLevel.ok
      ? "Assumed Sensex Level must be a positive number."
      : null;
  const changed =
    niftyLevel.ok &&
    sensexLevel.ok &&
    (niftyLevel.value !== assumedLevels.nifty || sensexLevel.value !== assumedLevels.sensex);
  const applied = assumedLevels.nifty != null || assumedLevels.sensex != null;
  const canReset = applied || nifty.trim() !== "" || sensex.trim() !== "";

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!changed || !niftyLevel.ok || !sensexLevel.ok) return;
    setAssumedLevels({ nifty: niftyLevel.value, sensex: sensexLevel.value });
  }

  function reset() {
    setNifty("");
    setSensex("");
    if (applied) setAssumedLevels({ nifty: null, sensex: null });
  }

  return (
    <form className="mb-4" onSubmit={apply}>
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor="assumed-nifty-level">
            Assumed Nifty Level
          </label>
          <Input
            id="assumed-nifty-level"
            className="font-semibold tabular-nums"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatNumber(deskLevels.nifty, INDEX_STRIKE_PRICE_DECIMALS)}
            value={nifty}
            aria-invalid={!niftyLevel.ok}
            onChange={(event) => setNifty(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <label className="label-chip mb-1" htmlFor="assumed-sensex-level">
            Assumed Sensex Level
          </label>
          <Input
            id="assumed-sensex-level"
            className="font-semibold tabular-nums"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatNumber(deskLevels.sensex, INDEX_STRIKE_PRICE_DECIMALS)}
            value={sensex}
            aria-invalid={!sensexLevel.ok}
            onChange={(event) => setSensex(event.target.value)}
          />
        </div>
        <PrimaryButton type="submit" className="h-[3.25rem] px-6" disabled={!changed}>
          Apply
        </PrimaryButton>
        <GhostButton type="button" className="h-[3.25rem] px-6" disabled={!canReset} onClick={reset}>
          Reset To Desk Level
        </GhostButton>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Expected Internal Rate of Return is the Client Internal Rate of Return at these levels, capped at Product
        Internal Rate of Return. A blank level uses the desk level.
      </p>
    </form>
  );
}
