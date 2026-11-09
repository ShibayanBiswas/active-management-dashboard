"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/context/theme-provider";
import { mainSections, resolveNavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const pathname = usePathname();
  const section = resolveNavSection(pathname);
  const { theme, toggle } = useTheme();

  return (
    <div className="border-t border-[color:var(--ar-border)] bg-[color:var(--ar-subnav-bg)]">
      <div className="mx-auto flex max-w-full items-center justify-between gap-4 overflow-x-auto px-4 py-2 lg:px-6">
        <div className="nav-pill-shell flex items-center gap-1 rounded-2xl border p-1 shadow-sm">
          {mainSections.map((item) => {
            const active = section.id === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  active
                    ? "btn-nav-active text-ink"
                    : "text-muted hover:bg-[color:var(--ar-panel)] hover:text-ink",
                )}
              >
                {active ? (
                  <motion.span
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold/25 to-maroon/20 shadow-lg shadow-gold/10 dark:from-gold/6 dark:to-transparent dark:shadow-none"
                    layoutId="main-nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  />
                ) : null}
                <motion.span
                  className="relative inline-flex"
                  whileHover={{ scale: 1.12, rotate: -4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  <Icon className="h-4 w-4" />
                </motion.span>
                <span className="relative hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="btn-ghost btn-animated inline-flex shrink-0 items-center gap-2 text-xs"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {section.subNav?.length ? (
          <motion.div
            key={section.id}
            animate={{ opacity: 1, y: 0 }}
            className="nav-sub-bar border-t"
            exit={{ opacity: 0, y: -4 }}
            initial={false}
          >
            <div className="mx-auto flex max-w-full flex-wrap items-center gap-1 px-4 py-2 lg:px-6">
              {section.subNav.map((sub) => {
                const active = sub.match?.(pathname) ?? pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={cn("nav-sub-pill whitespace-nowrap", active && "nav-sub-pill-active")}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
