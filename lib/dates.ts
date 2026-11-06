import { format } from "date-fns";

/** Calendar YYYY-MM-DD in Asia/Kolkata: desk today, not the server's UTC date. */
export function deskTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** ISO timestamp with the Asia/Calcutta offset, e.g. 2026-11-06T10:20:00+05:30. */
export function istTimestamp(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  return `${shifted.toISOString().slice(0, 19)}+05:30`;
}

export function parseISODate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const day = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  return new Date(NaN);
}

/** Whole days from a to b (b minus a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Jul-26" */
export function monthYearLabel(iso: string): string {
  const d = parseISODate(iso);
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1), "MMM-yy");
}

/** "29-Oct-2026" */
export function formatDeskDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), "d-MMM-yyyy");
}
