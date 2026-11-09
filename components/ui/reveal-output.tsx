"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";

import { deskEase } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function RevealOutput({
  children,
  label = "Click Here To Reveal Output",
  className,
  resetKey,
  footer,
  onReveal,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  resetKey?: string | number;
  footer?: ReactNode;
  onReveal?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  const reduce = useReducedMotion();

  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setOpen(false);
  }

  return (
    <div className={cn("w-full", className)}>
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="reveal-closed"
            animate={{ opacity: 1, y: 0 }}
            className="btn-reveal group relative w-full overflow-hidden"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: deskEase }}
            type="button"
            whileHover={reduce ? undefined : { scale: 1.015, y: -2 }}
            whileTap={reduce ? undefined : { scale: 0.985 }}
            onClick={() => {
              onReveal?.();
              setOpen(true);
            }}
          >
            <motion.span
              className="relative"
              animate={reduce ? undefined : { rotate: [0, 12, -12, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-4 w-4 text-gold-dark/80" />
            </motion.span>
            <span className="relative">{label}</span>
            <ChevronRight className="relative h-4 w-4 transition group-hover:translate-x-1" />
          </motion.button>
        ) : (
          <motion.div
            key="reveal-open"
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="space-y-4"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.5, ease: deskEase }}
          >
            {children}
            {footer ? (
              <div className="flex justify-end border-t border-[color:var(--ar-border)] pt-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
