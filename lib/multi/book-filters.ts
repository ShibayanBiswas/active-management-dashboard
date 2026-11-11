import {
  OBSERVATION_PROGRESS_TABS,
  productHasProgressTab,
  type ObservationProgressTab,
} from "@/lib/active-management/observations";
import {
  OBSERVATION_DATE_MODE_LABELS,
  productMatchesObservationRange,
  type ObservationDateMode,
} from "@/lib/multi/observation-date-filter";
import { LIVE_OBSERVATION_TAB_ORDER, productHasObservationTab, type ObservationTabId } from "@/lib/observation-tabs";
import type { ProductMaster } from "@/lib/types";
import { formatDeskDate } from "@/lib/utils";

/**
 * The Product Book's segregation: search, observation tab, Reveal date window and observation
 * progress tab. Every Home table that follows the Product Book filters through these, so the
 * tables cannot disagree on which products a tab shows.
 */

export type ProgressTabId = "all" | ObservationProgressTab;

/** Second tab strip. Filters inside the active observation tab, search and revealed date window. */
export const PROGRESS_TAB_ORDER: ReadonlyArray<{ id: ProgressTabId; label: string }> = [
  { id: "all", label: "All Products" },
  ...OBSERVATION_PROGRESS_TABS,
];

/** The window Reveal applied. */
export type RevealWindow = { mode: ObservationDateMode; start: string; end: string };

/** needle is trimmed and lower case; blank matches every product. */
function matchesBookQuery(product: ProductMaster, needle: string): boolean {
  if (!needle) return true;
  return [product.productName, product.productCode, product.formulae]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0 && value !== "-")
    .some((value) => value.toLowerCase().includes(needle));
}

function clampDate(value: string, min: string, max: string): string {
  if (!value) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Start Date and End Date as the inputs show them: a blank or out-of-range edit falls back to
 * the earliest observation on the book (min) and the as-of day (max).
 */
export function revealDateRange(min: string, max: string, rangeStart: string, rangeEnd: string): { start: string; end: string } {
  const start = clampDate(rangeStart || min, min, max);
  return { start, end: clampDate(rangeEnd || max, start || min, max) };
}

/** Products with at least one passed observation. Dates only, so it is worked out once per book and as-of day. */
export function somePassedProducts(products: ProductMaster[], asOf: string): Set<ProductMaster> {
  const set = new Set<ProductMaster>();
  for (const product of products) {
    if (productHasProgressTab(product, "some-passed", asOf)) set.add(product);
  }
  return set;
}

export function inProgressTab(product: ProductMaster, tab: ProgressTabId, somePassed: ReadonlySet<ProductMaster>): boolean {
  return tab === "all" || somePassed.has(product) === (tab === "some-passed");
}

/** Search and observation tab. The revealed window and the progress tab filter inside these. */
export function bookTabProducts(
  products: ProductMaster[],
  query: string,
  observationTab: ObservationTabId,
  asOf: string,
): ProductMaster[] {
  const needle = query.trim().toLowerCase();
  return products.filter(
    (product) => matchesBookQuery(product, needle) && productHasObservationTab(product, observationTab, asOf),
  );
}

export function revealedProducts(tabProducts: ProductMaster[], reveal: RevealWindow | null): ProductMaster[] {
  if (!reveal) return tabProducts;
  return tabProducts.filter((product) => productMatchesObservationRange(product, reveal.mode, reveal.start, reveal.end));
}

export function progressTabCounts(filtered: ProductMaster[], somePassed: ReadonlySet<ProductMaster>): Record<ProgressTabId, number> {
  let some = 0;
  for (const product of filtered) if (somePassed.has(product)) some += 1;
  return { all: filtered.length, "none-passed": filtered.length - some, "some-passed": some };
}

export function progressTabProducts(
  filtered: ProductMaster[],
  tab: ProgressTabId,
  somePassed: ReadonlySet<ProductMaster>,
): ProductMaster[] {
  return tab === "all" ? filtered : filtered.filter((product) => inProgressTab(product, tab, somePassed));
}

/** The view's tab, progress tab and revealed window as words, for Export View file names and subtitles. Blank when not applied. */
export function bookViewLabels(
  observationTab: ObservationTabId,
  progressTab: ProgressTabId,
  reveal: RevealWindow | null,
): { tab: string; progress: string; revealed: string } {
  return {
    tab: LIVE_OBSERVATION_TAB_ORDER.find((item) => item.id === observationTab)?.label ?? "Ongoing",
    progress: progressTab === "all" ? "" : (PROGRESS_TAB_ORDER.find((item) => item.id === progressTab)?.label ?? ""),
    revealed: reveal
      ? `${OBSERVATION_DATE_MODE_LABELS[reveal.mode]} ${formatDeskDate(reveal.start)} to ${formatDeskDate(reveal.end)}`
      : "",
  };
}
