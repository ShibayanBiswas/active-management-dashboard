"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileSpreadsheet, FileText, RotateCcw, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { deskEase } from "@/lib/motion";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glass w-full min-w-0 rounded-xl border border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] p-3 shadow-sm sm:p-4", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, icon: Icon, right }: { children: ReactNode; icon?: LucideIcon; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink sm:text-lg">
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-gold" /> : null}
        <span className="min-w-0">{children}</span>
      </h3>
      {right}
    </div>
  );
}

/** Tab title with Download Excel, Download PDF and Reset at the far right. */
export function TabHeading({
  title,
  subtitle,
  onExcel,
  onPdf,
  onReset,
}: {
  title: string;
  subtitle?: string;
  onExcel?: () => void;
  onPdf?: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-gold/20 pb-3">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 font-ui">
        {onExcel ? (
          <GhostButton onClick={onExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Download Excel
          </GhostButton>
        ) : null}
        {onPdf ? (
          <GhostButton onClick={onPdf}>
            <FileText className="h-4 w-4" /> Download PDF
          </GhostButton>
        ) : null}
        {onReset ? (
          <GhostButton onClick={onReset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </GhostButton>
        ) : null}
      </div>
    </div>
  );
}

export function KpiBand({ items }: { items: Array<{ label: string; value: string; title?: string }> }) {
  const reduce = useReducedMotion();
  return (
    <div className="kpi-band-equal-row w-full" role="list" aria-label="Headline Metrics" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(10.75rem, 1fr))` }}>
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          className="kpi-card kpi-card-live kpi-card-fill kpi-card-dense min-w-0 border border-[color:var(--ar-border)]"
          role="listitem"
          title={item.title}
          initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4, ease: deskEase }}
        >
          <div className="kpi-card-label">{item.label}</div>
          <div className="kpi-card-value mt-1">{item.value}</div>
        </motion.div>
      ))}
    </div>
  );
}

export function SpecRail({ cards }: { cards: Array<{ label: string; value: string }> }) {
  return (
    <div className="horizontal-rail-spec w-full">
      <div className="horizontal-rail-spec-inner">
        {cards.map((card) => (
          <div key={card.label} className="spec-rail-card spec-rail-item">
            <p className="spec-rail-label">{card.label}</p>
            <p className="spec-rail-value">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 font-ui">
      <span className="label-chip">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "input-glow w-full rounded-xl border border-[color:var(--ar-border)] bg-[color:var(--ar-input-bg)] px-3 py-2 text-sm outline-none focus:border-gold",
        props.className,
      )}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn("select-dark w-full rounded-xl px-3 py-2 text-sm outline-none", props.className)}>
      {children}
    </select>
  );
}

export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type={props.type ?? "button"} className={cn("btn-animated btn-motion btn-primary", props.disabled && "pointer-events-none opacity-40", className)}>
      <span className="btn-shine" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function GhostButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type={props.type ?? "button"} className={cn("btn-animated btn-motion btn-accent !px-4 !py-2", props.disabled && "pointer-events-none opacity-40", className)}>
      <span className="btn-shine" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-[color:var(--ar-border)] bg-[color:var(--ar-panel)] p-1 font-ui">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition", value === o.id ? "bg-gold/20 text-maroon shadow-sm" : "text-muted hover:text-ink")}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DeskLoading({ title = "Opening The Desk Book" }: { title?: string }) {
  return (
    <div className="desk-loading">
      <span className="desk-loading-rule desk-loading-rule--pulse" />
      <p className="desk-loading-title">{title}</p>
      <p className="desk-loading-sub">Pricing every option leg on the surface and growing the book to the valuation date.</p>
    </div>
  );
}
