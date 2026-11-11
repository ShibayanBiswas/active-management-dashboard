import {
  Calculator,
  LayoutDashboard,
  Sparkles,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavSectionId = "home" | "portfolio" | "intel" | "upload";

export type SubNavItem = {
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export type MainNavItem = {
  id: NavSectionId;
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  subNav?: SubNavItem[];
};

export const mainSections: MainNavItem[] = [
  {
    id: "home",
    href: "/",
    label: "Home",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    id: "portfolio",
    href: "/portfolio/unwinding",
    label: "Portfolio",
    icon: Calculator,
    match: (p) => p.startsWith("/portfolio"),
    subNav: [
      {
        href: "/portfolio/unwinding",
        label: "Unwinding Calculator",
        match: (p) => p.startsWith("/portfolio/unwinding"),
      },
    ],
  },
  {
    id: "intel",
    href: "/intelligence",
    label: "Intelligence",
    icon: Sparkles,
    match: (p) => p.startsWith("/intelligence"),
  },
  {
    id: "upload",
    href: "/upload",
    label: "Upload",
    icon: Upload,
    match: (p) => p.startsWith("/upload"),
  },
];

export function resolveNavSection(pathname: string): MainNavItem {
  return mainSections.find((s) => s.match(pathname)) ?? mainSections[0];
}
