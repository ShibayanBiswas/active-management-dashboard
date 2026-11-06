import { BrainCircuit, CalendarCheck, Grid3x3, Layers, LayoutDashboard, LineChart, Upload, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Desk tabs. Also the allowlist for SP Workstation navigate messages. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Book Summary", icon: LayoutDashboard },
  { href: "/observations", label: "Observations", icon: CalendarCheck },
  { href: "/scenarios", label: "Scenarios", icon: Grid3x3 },
  { href: "/legs", label: "Leg Book", icon: Layers },
  { href: "/pricing", label: "Pricing", icon: LineChart },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/upload", label: "Upload", icon: Upload },
];

export function activeNavHref(pathname: string): string {
  if (pathname.startsWith("/product/")) return "/";
  return NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.href ?? "/";
}
