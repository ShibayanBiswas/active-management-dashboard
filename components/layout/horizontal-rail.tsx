"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function HorizontalBand({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("w-full", className)} id={id}>
      {children}
    </section>
  );
}

/** Horizontally laid-out rail — fill full row by default; scroll only on overflow. */
export function HorizontalRail({
  children,
  className,
  gap = "gap-4",
  fillFirst = true,
}: {
  children: ReactNode;
  className?: string;
  gap?: string;
  fillFirst?: boolean;
}) {
  return (
    <div
      className={cn(
        "horizontal-rail w-full -mx-1 px-1 pb-2",
        fillFirst && "horizontal-rail-fill",
        !fillFirst && "overflow-x-auto",
        className,
      )}
    >
      <div
        className={cn(
          "flex snap-x snap-mandatory",
          fillFirst && "horizontal-rail-fill-inner w-full",
          !fillFirst && "w-max min-w-full flex-nowrap",
          gap,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function RailCard({
  children,
  className,
  fillFirst = true,
}: {
  children: ReactNode;
  className?: string;
  fillFirst?: boolean;
}) {
  return (
    <div className={cn("rail-card snap-start", fillFirst ? "rail-card-fill w-full" : "shrink-0", className)}>
      {children}
    </div>
  );
}
