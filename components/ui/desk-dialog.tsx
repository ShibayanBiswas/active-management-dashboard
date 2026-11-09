"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type DeskDialogTone = "success" | "error";

export function DeskDialog({
  open,
  tone,
  title,
  children,
  onClose,
}: {
  open: boolean;
  tone: DeskDialogTone;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="desk-dialog-title"
            className="glass w-full max-w-lg rounded-2xl border border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] p-5 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Icon
                  className={
                    tone === "success" ? "mt-0.5 h-5 w-5 shrink-0 text-emerald-600" : "mt-0.5 h-5 w-5 shrink-0 text-maroon"
                  }
                />
                <h2 id="desk-dialog-title" className="text-lg font-bold tracking-tight text-ink">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-stone-100 hover:text-ink dark:hover:bg-stone-800"
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm leading-relaxed text-ink">{children}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={
                  tone === "success"
                    ? "btn-animated btn-motion btn-primary"
                    : "btn-animated btn-motion btn-accent"
                }
                onClick={onClose}
              >
                <span className="btn-shine" aria-hidden />
                <span className="relative z-10">Close</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
