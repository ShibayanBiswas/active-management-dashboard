"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { type LucideIcon } from "lucide-react";

import { HeaderUploadShortcuts } from "@/components/dashboard/desk-upload";
import { BrandLogo } from "@/components/layout/brand-logo";
import { DeskFooter } from "@/components/layout/desk-footer";
import { SiteNav } from "@/components/layout/site-nav";
import { deskEase } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function AppPage({ children, dense }: { children: ReactNode; dense?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-mesh font-serif">
      <div className="desk-ambient-orbs" aria-hidden>
        <span className="desk-ambient-orb desk-ambient-orb--gold" />
        <span className="desk-ambient-orb desk-ambient-orb--maroon" />
      </div>
      <header className="brand-header sticky top-0 z-50 font-ui">
        <div className="brand-header-glow" />
        <div className="brand-header-row">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo />
            <div className="min-w-0 border-l border-[color:var(--ar-border)] pl-4">
              <h1 className="brand-title">Active Management Dashboard</h1>
            </div>
          </div>
          <HeaderUploadShortcuts />
        </div>
        <SiteNav />
      </header>
      <main className={cn("relative z-10 mx-auto w-full max-w-full flex-1 px-4 lg:px-6", dense ? "py-3" : "py-5")}>
        {children}
      </main>
      <DeskFooter />
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "glass w-full min-w-0 rounded-xl border border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] p-3 shadow-sm sm:p-4",
        className,
      )}
      initial={false}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: deskEase }}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold tracking-tight text-ink sm:text-lg">
      {Icon ? <Icon className="h-5 w-5 shrink-0 text-gold" /> : null}
      <span className="min-w-0">{children}</span>
    </h2>
  );
}

export function SubPageTabs({
  tabs,
  active,
  onSelect,
  scroll = false,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onSelect: (id: string) => void;
  /** One row that scrolls sideways at every width, instead of wrapping from `sm` up. */
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "subpage-tabs flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-100 p-1.5 dark:border-[color:var(--ar-border)] dark:bg-[color:var(--ar-panel)] sm:gap-2",
        !scroll && "sm:flex-wrap sm:overflow-visible",
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "relative whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm",
              scroll ? "flex-none" : "flex-1",
              isActive
                ? "text-maroon dark:text-[#a89860]"
                : "text-stone-600 hover:bg-white hover:text-ink dark:text-stone-500 dark:hover:text-stone-300",
            )}
            onClick={() => onSelect(tab.id)}
          >
            {isActive ? (
              <motion.span
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold/30 to-gold/10 shadow-sm dark:from-gold/6 dark:to-transparent"
                layoutId="uc-subpage-tab"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function KpiBand({
  items,
}: {
  items: Array<{ label: string; value: string; accent?: "gold" | "maroon" | "muted" | "cyan" }>;
}) {
  const reduce = useReducedMotion();
  const count = items.length;

  return (
    <div
      className="kpi-band-equal-row w-full"
      role="list"
      aria-label="Headline metrics"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(10.75rem, 1fr))` }}
    >
      {items.map((item, i) => (
        <motion.div
          key={`${item.label}-${i}`}
          className="kpi-card kpi-card-live kpi-card-fill kpi-card-dense min-w-0 border border-[color:var(--ar-border)]"
          role="listitem"
          initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-20px" }}
          transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4, ease: deskEase }}
        >
          <div className="kpi-card-label">{item.label}</div>
          <div
            className={cn(
              "kpi-card-value mt-1",
              item.accent === "maroon" && "!bg-none text-maroon dark:text-gold",
              item.accent === "gold" && "!bg-none text-gold-dark",
            )}
            style={
              item.accent === "maroon" || item.accent === "gold"
                ? { background: "none", WebkitBackgroundClip: "unset", color: undefined }
                : undefined
            }
          >
            {item.value}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Equal-height specification cards in one row. Values wrap. No gold top bar.
 */
export function SpecRail({
  cards,
  className,
}: {
  cards: Array<{ label: string; value: string }>;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("horizontal-rail-spec w-full", className)}>
      <div className="horizontal-rail-spec-inner">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            className="spec-rail-card spec-rail-item"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.35, ease: deskEase }}
          >
            <p className="spec-rail-label" title={card.label}>
              {card.label}
            </p>
            <p className="spec-rail-value">{card.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** One parameter per full-width row — label left, control right. Matches Primary SP Details. */
export function FieldStack({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-3">{children}</div>;
}

export function FieldRow({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("grid w-full gap-2", wide ? "md:grid-cols-[260px_1fr]" : "md:grid-cols-[200px_1fr]")}>
      <div className="flex items-start gap-2 pt-2.5">
        <label className="label-chip">{label}</label>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Input({
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  const field = (
    <input
      {...props}
      className={cn(
        "input-glow w-full rounded-2xl border border-[color:var(--ar-border)] bg-[color:var(--ar-input-bg)] px-4 py-3 text-sm outline-none focus:border-gold",
        suffix && "pr-14",
        props.className,
      )}
    />
  );
  if (!suffix) return field;
  return (
    <div className="relative w-full">
      {field}
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold tracking-wide text-gold-dark">
        {suffix}
      </span>
    </div>
  );
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "btn-animated btn-motion btn-primary",
        props.disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      <span className="btn-shine" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "btn-animated btn-motion btn-accent",
        props.disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      <span className="btn-shine" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
