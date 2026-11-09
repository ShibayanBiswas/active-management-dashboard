import { deskTodayISO, formatDeskDateFull } from "@/lib/utils";

/** Strip characters that break download filenames on Windows / macOS / browsers. */
export function sanitizeExportToken(value: string | undefined | null, fallback = "export"): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

/** Desk export stamp for filenames — e.g. 10-Aug-2026. */
export function exportFilenameStamp(date: Date = new Date()): string {
  return formatDeskDateFull(deskTodayISO(date)).replace(/\s+/g, "-");
}

/**
 * Same Primary SP desk naming:
 * `SP-{Screen}-{code|slug}-{DD-MMM-YYYY}.{ext}`
 */
export function buildDeskExportFilename(options: {
  screen: string;
  productCode?: string | null;
  productName?: string | null;
  asOf?: Date;
  extension: "xlsx" | "pdf";
}): string {
  const screen = sanitizeExportToken(options.screen, "Desk");
  const id = sanitizeExportToken(options.productCode || options.productName, "product");
  const stamp = sanitizeExportToken(exportFilenameStamp(options.asOf ?? new Date()), "date");
  return `SP-${screen}-${id}-${stamp}.${options.extension}`;
}
