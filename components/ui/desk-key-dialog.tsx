"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound } from "lucide-react";

/** Asks for the Desk Key before a save or upload. The key is never stored; it stays in memory until the page reloads. */
export function DeskKeyDialog({
  error,
  onSubmit,
  onCancel,
}: {
  error: string | null;
  onSubmit: (key: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-key-title"
        data-testid="desk-key-dialog"
        className="glass w-full max-w-md rounded-2xl border border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <div className="mb-3 flex items-start gap-2">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-maroon" aria-hidden />
          <h2 id="desk-key-title" className="text-lg font-bold tracking-tight text-ink">
            Desk Key
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-ink">
          Saving changes the desk data for every user. Enter the Desk Key to continue; it is kept only until you reload
          the page.
        </p>
        <input
          ref={input}
          type="password"
          autoComplete="off"
          aria-label="Desk Key"
          data-testid="desk-key-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "desk-key-error" : undefined}
          className="mt-3 w-full rounded-xl border border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
        {error ? (
          <p id="desk-key-error" role="alert" className="mt-2 text-sm font-semibold text-maroon">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-animated btn-motion btn-accent" onClick={onCancel} data-testid="desk-key-cancel">
            <span className="relative z-10">Cancel</span>
          </button>
          <button type="submit" className="btn-animated btn-motion btn-primary" data-testid="desk-key-submit">
            <span className="btn-shine" aria-hidden />
            <span className="relative z-10">Save</span>
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
