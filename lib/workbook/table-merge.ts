import { PRODUCT_BOOK_HEADERS } from "@/lib/workbook/export-columns";

/**
 * Columns that may club consecutive identical values inside a strike group.
 * Priced / per-expiry columns are excluded so equal rounded marks never hide a row.
 */

/** Pricer headers: Strike … Option Delta (14 cols). Group by strike (col 0). */
export const PRICER_MERGE_COLS = [
  0, // Strike Price
  2, // Unwinding Date
  3, // Option Type
  4, // Underlying Spot Level
  5, // Forward Growth Rate
  6, // Discount Yield
  8, // Volatility Bump
  9, // Bid Offer Spread
] as const;

/**
 * Excel and PDF only. The screen blanks a repeated value in every column instead.
 * Shared cells club. A priced cell merges only when the number is the same.
 * Every column clubs inside a product except the two per-leg marks. The Active Management
 * columns are one value per product, so they club across its legs like the quote columns.
 */
const PER_LEG_MARK_HEADERS: ReadonlySet<string> = new Set(["Unwind Option Price", "Premium Outflow Amount"]);
export const PRODUCT_BOOK_MERGE_COLS: readonly number[] = PRODUCT_BOOK_HEADERS.flatMap((header, index) =>
  PER_LEG_MARK_HEADERS.has(header) ? [] : [index],
);

/** Options Book headers (11 cols). Group by strike (col 1). Quantity Rounded is not shown. */
export const OPTION_BOOK_MERGE_COLS = [
  0, // Option Type
  1, // Strike Price
  2, // Number of Spreads
  3, // Original Buy or Sell
  4, // Unwind Buy or Sell
  5, // Unwind Quantity
  7, // Product Premium Per Spread
  8, // Product Premium Amount
] as const;
