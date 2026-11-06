"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Database, Moon, Server, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { cn } from "@/lib/cn";
import { useDesk } from "@/lib/context/desk-provider";
import { useTheme } from "@/lib/context/theme-provider";
import { formatDeskDate } from "@/lib/dates";
import { activeNavHref, NAV_ITEMS } from "@/lib/navigation";

function SiteNav() {
  const pathname = usePathname();
  const active = activeNavHref(pathname);
  const { theme, toggle } = useTheme();
  return (
    <div className="border-t border-[color:var(--ar-border)] bg-[color:var(--ar-subnav-bg)]">
      <div className="mx-auto flex max-w-full items-center justify-between gap-4 overflow-x-auto px-4 py-2 lg:px-6">
        <nav className="nav-pill-shell flex items-center gap-1 rounded-2xl border p-1 shadow-sm" aria-label="Desk Tabs">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  isActive ? "btn-nav-active text-ink" : "text-muted hover:bg-[color:var(--ar-panel)] hover:text-ink",
                )}
              >
                {isActive ? (
                  <motion.span
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold/25 to-maroon/20 shadow-lg shadow-gold/10 dark:from-gold/6 dark:to-transparent dark:shadow-none"
                    layoutId="main-nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  />
                ) : null}
                <Icon className="relative h-4 w-4" />
                <span className="relative hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={toggle} className="btn-ghost btn-animated inline-flex shrink-0 items-center gap-2 text-xs" aria-label="Toggle Theme">
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </div>
  );
}

function DeskClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return <span>Desk Clock {now ? now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</span>;
}

function DeskFooter() {
  const { data, book, loading } = useDesk();
  const status = loading && !data
    ? "Opening The Desk Book"
    : data
      ? `${data.source === "mongo" ? "Live Book" : "Demo Book"} · ${data.products.length} Products · ${data.surface.label} · Valuation ${formatDeskDate(book?.ctx.inputs.valuationDate)}`
      : "Book Unavailable";
  const legs = data?.products.reduce((s, p) => s + p.legs.length, 0) ?? 0;
  return (
    <footer className="relative z-10 mt-8 border-t border-stone-200 bg-white/90 font-ui backdrop-blur-xl dark:border-[color:var(--ar-border)] dark:bg-[color-mix(in_srgb,var(--ar-surface)_92%,transparent)]">
      <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px] text-stone-500 dark:text-stone-400 lg:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-gold" />
            Anand Rathi Wealth · Active Management Dashboard
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-gold-light" />
            {legs ? `${legs} Option Legs` : "Opening Book"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
            <DeskClock />
          </span>
        </div>
        <p className="max-w-xl truncate text-right italic" title={status}>
          {status}
        </p>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
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
        </div>
        <SiteNav />
      </header>
      <main className="relative z-10 mx-auto w-full max-w-full flex-1 px-4 py-5 lg:px-6">{children}</main>
      <DeskFooter />
    </div>
  );
}
