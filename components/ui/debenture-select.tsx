"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/layout/app-ui";
import { cn } from "@/lib/utils";

/** Same preset chips as Primary SP Product Details. Issued count is added when it is the max. */
export const DEBENTURE_PRESETS = ["1", "10", "25", "50", "100", "250", "500", "1000"] as const;

export function DebentureSelect({
  value,
  onChange,
  maxDebentures,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  maxDebentures: number;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const cap = Math.max(1, Math.floor(maxDebentures) || 1_000_000);

  const validate = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return "Enter a whole number of debentures.";
    if (!/^[1-9]\d*$/.test(trimmed)) return "Natural numbers only — no zero, decimals, or letters.";
    const n = Number(trimmed);
    if (n > cap) {
      return `Cannot exceed ${cap.toLocaleString("en-IN")} debentures issued on this product.`;
    }
    return null;
  };

  const apply = (raw: string) => {
    const message = validate(raw);
    if (message) {
      setError(message);
      const fallback = String(cap);
      setDraft(fallback);
      onChange(fallback);
      return;
    }
    setError(null);
    const normalized = String(Math.max(1, Math.round(Number(raw.trim()))));
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoComplete="off"
          className="input-glow min-w-[10rem] flex-1 font-semibold text-ink"
          inputMode="numeric"
          placeholder="—"
          type="text"
          value={draft}
          onBlur={() => apply(draft)}
          onChange={(e) => {
            setError(null);
            setDraft(e.target.value.replace(/[^\d]/g, ""));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(draft);
            }
          }}
        />
        <span className="desk-chip">
          Max <span className="font-bold text-maroon">{cap.toLocaleString("en-IN")}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...DEBENTURE_PRESETS.filter((n) => Number(n) < cap), String(cap)].map((n) => (
          <button
            key={n}
            className={cn("desk-preset", draft === n && "desk-preset-active")}
            type="button"
            onClick={() => {
              setError(null);
              setDraft(n);
              onChange(n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {error ? (
        <div className="desk-alert-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
