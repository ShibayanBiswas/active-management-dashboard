"use client";

import { useReducedMotion } from "framer-motion";

export function DeskLoadingState({
  title = "Preparing Marks",
  subtitle = "Interpolating the live surface and writing the options book",
}: {
  title?: string;
  subtitle?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="desk-loading" role="status" aria-live="polite">
      <p className="desk-loading-title">{title}</p>
      <span className={reduce ? "desk-loading-rule" : "desk-loading-rule desk-loading-rule--pulse"} aria-hidden />
      <p className="desk-loading-sub">{subtitle}</p>
    </div>
  );
}
