import type { UnderlyingIndex, UnwindInputs } from "@/lib/types";

export { cn } from "@/lib/cn";

const SENSEX_NAME_RE = /sensex|s\s*&\s*p\s*bse|bse[\s._-]*sensex|spsx/i;

/** Sensex anywhere in the product name or code, or S&P BSE / BSE Sensex → Sensex. Otherwise Nifty. */
export function underlyingFromProductName(name: string, code = ""): UnderlyingIndex {
  return SENSEX_NAME_RE.test(`${name} ${code}`) ? "Sensex" : "Nifty";
}

/** Live index used for marks and the vol moneyness grid. Null until Underlying and a real spot exist. */
export function deskPricingSpot(inputs: UnwindInputs): number | null {
  if (inputs.underlying === "Sensex") {
    const level = inputs.sensex ?? 0;
    return level > 0 ? level : null;
  }
  if (inputs.underlying === "Nifty") {
    const level = inputs.nifty != null && inputs.nifty > 0 ? inputs.nifty : inputs.spot;
    return level > 0 ? level : null;
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar YYYY-MM-DD in Asia/Kolkata — desk “today”, not the server’s UTC date. */
export function deskTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function calendarParts(value: Date | string | null | undefined): { y: number; m: number; day: number } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { y: Number(iso[1]), m: Number(iso[2]), day: Number(iso[3]) };
  }
  const date = typeof value === "string" ? parseISODate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return null;
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function daysBetween(a: Date, b: Date): number {
  const ms =
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) -
    Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.round(ms / 86_400_000);
}

export function parseISODate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  const day = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  // DD-MMM-YY / DD-MMM-YYYY
  const m = String(value).match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (m) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, months[m[2].toLowerCase()] ?? 0, Number(m[1])));
  }
  return new Date(NaN);
}

export function formatDeskDate(d: Date | string | null | undefined): string {
  const parts = calendarParts(d);
  if (!parts) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.day}-${months[parts.m - 1]}-${String(parts.y).slice(-2)}`;
}

/** Full calendar year, matching the Volatility Surface workbook (30-Jun-2026). */
export function formatDeskDateFull(d: Date | string | null | undefined): string {
  const parts = calendarParts(d);
  if (!parts) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.day}-${months[parts.m - 1]}-${parts.y}`;
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "-";
  return `${(v * 100).toFixed(digits)}%`;
}

/** Signed zero is a number, but `Object.is(-0)` is true and must never reach toLocaleString. */
export function finiteDeskNumber(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Object.is(v, -0) || v === 0 ? 0 : v;
}

export function formatDeskRupees(v: number | null | undefined): string {
  const n = finiteDeskNumber(v);
  if (n == null) return "-";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  const n = finiteDeskNumber(v);
  if (n == null) return "-";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Minus for outflows only — never a leading plus on desk prices. */
export function formatSignedNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "-";
  const abs = Math.abs(v).toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  if (v < 0) return `-${abs}`;
  return abs;
}

/** Desk Book blank placeholder for empty text / missing values. */
export const DESK_BLANK = "-";

/** Coerce empty / whitespace / legacy em-dash cells to the desk blank marker. */
export function deskBlank(value: unknown): string {
  if (value == null) return DESK_BLANK;
  const text = String(value).trim();
  if (!text || text === "—" || text === "-") return DESK_BLANK;
  return text;
}

/** Serial day count used in pricer code keys (epoch 1899-12-30). */
export function toSerialDay(d: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - epoch) / 86_400_000);
}

export function roundTo(n: number, step: number): number {
  if (step === 0) return n;
  return Math.round(n / step) * step;
}

/**
 * Desk money / option mark to two decimal places (Excel currency / ROUND paisa).
 * Used end-to-end on Pricer prices, Options Book unwind marks, and rupee outflows.
 */
/**
 * Client and Residual Internal Rate of Return are shown no higher than the Product Internal
 * Rate of Return, the most the product pays. With no Product IRR (coupon or tenor 0) the rate
 * is shown as it is.
 */
export function capAtProductIrr(irr: number | null | undefined, productIRR: number | null | undefined): number | null {
  if (irr == null || !Number.isFinite(irr)) return null;
  return productIRR != null && productIRR > 0 ? Math.min(irr, productIRR) : irr;
}

export function roundDeskMoney(n: number): number {
  const x = finiteDeskNumber(n);
  if (x == null) return 0;
  return Number((Math.round(x * 100) / 100).toFixed(2));
}

export type ParseEditResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export type ParseEditDateResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const WRONG_INPUT = "Wrong input. Please try again.";

/** Strip currency / grouping so 12,34,567.89 or ₹ 1,00,000 parse cleanly. */
function stripEditedNumericNoise(raw: string): string {
  return String(raw).trim().replace(/[₹Rs\s]/gi, "").replace(/,/g, "");
}

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

/**
 * Parse a desk number. Accepts Indian/US commas; rejects letters, multiple decimals,
 * and (when integer) any fractional part.
 */
export function tryParseEditedNumber(
  raw: string,
  opts?: { integer?: boolean; allowNegative?: boolean },
): ParseEditResult {
  const text = String(raw).trim();
  if (!text || text === "—" || text === "-") {
    return { ok: false, error: WRONG_INPUT };
  }
  const cleaned = stripEditedNumericNoise(text);
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return { ok: false, error: WRONG_INPUT };
  }
  if (countChar(cleaned, ".") > 1) {
    return { ok: false, error: WRONG_INPUT };
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: WRONG_INPUT };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, error: WRONG_INPUT };
  }
  if (opts?.allowNegative === false && n < 0) {
    return { ok: false, error: WRONG_INPUT };
  }
  if (opts?.integer) {
    if (!Number.isInteger(n)) {
      return { ok: false, error: WRONG_INPUT };
    }
    return { ok: true, value: n };
  }
  return { ok: true, value: n };
}

/** Desk percent cells show 7.50%. Values above 1, or with a percent sign, are fractions. */
export function tryParseEditedPct(raw: string): ParseEditResult {
  const text = String(raw).trim();
  if (!text || text === "—" || text === "-") {
    return { ok: false, error: WRONG_INPUT };
  }
  const hasPct = text.includes("%");
  const cleaned = stripEditedNumericNoise(text.replace(/%/g, ""));
  if (!cleaned || countChar(cleaned, ".") > 1 || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: WRONG_INPUT };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, error: WRONG_INPUT };
  }
  if (hasPct || Math.abs(n) > 1) return { ok: true, value: n / 100 };
  return { ok: true, value: n };
}

export function tryParseEditedDate(raw: string): ParseEditDateResult {
  const text = String(raw).trim();
  if (!text || text === "—" || text === "-") {
    return { ok: false, error: WRONG_INPUT };
  }
  const d = parseISODate(text);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: WRONG_INPUT };
  }
  return { ok: true, value: toIsoMidnight(d) };
}

/** Surface cells are percent points (57.36 means 57.36%). Do not treat them as fractions. */
export function tryParseEditedVolPoint(raw: string): ParseEditResult {
  const text = String(raw).trim();
  if (!text || text === "—" || text === "-") {
    return { ok: false, error: WRONG_INPUT };
  }
  const cleaned = stripEditedNumericNoise(text.replace(/%/g, ""));
  if (!cleaned || countChar(cleaned, ".") > 1 || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: WRONG_INPUT };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, error: WRONG_INPUT };
  }
  return { ok: true, value: n };
}

/** @deprecated Prefer tryParseEditedNumber — returns 0 on invalid input. */
export function parseEditedNumber(raw: string): number {
  const parsed = tryParseEditedNumber(raw, { allowNegative: true });
  return parsed.ok ? parsed.value : 0;
}

/** @deprecated Prefer tryParseEditedPct — returns 0 on invalid input. */
export function parseEditedPct(raw: string): number {
  const parsed = tryParseEditedPct(raw);
  return parsed.ok ? parsed.value : 0;
}

export function toIsoMidnight(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T00:00:00.000Z`;
}

/** @deprecated Prefer tryParseEditedDate — returns raw trim on invalid input. */
export function parseEditedDate(raw: string): string {
  const parsed = tryParseEditedDate(raw);
  return parsed.ok ? parsed.value : raw.trim();
}

/** @deprecated Prefer tryParseEditedVolPoint — returns 0 on invalid input. */
export function parseEditedVolPoint(raw: string): number {
  const parsed = tryParseEditedVolPoint(raw);
  return parsed.ok ? parsed.value : 0;
}

export function addUtcDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return toIsoMidnight(new Date());
  return toIsoMidnight(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)));
}

/**
 * Screen tables print a value once. A later row leaves that cell blank when it
 * matches the cell directly above. The first row of the window stays complete.
 */
export function blankRepeatedDisplay(matrix: string[][]): string[][] {
  return matrix.map((row, r) => {
    if (r === 0) return [...row];
    const prev = matrix[r - 1] ?? [];
    return row.map((value, c) => (value !== "" && value === prev[c] ? "" : value));
  });
}

/**
 * Merge repeated consecutive display values per column: the result holds the
 * rowSpan for each cell, where 0 means the cell is covered by a merge above.
 */
export function computeRowSpans(matrix: string[][]): number[][] {
  const rows = matrix.length;
  const cols = rows ? matrix[0].length : 0;
  const spans: number[][] = matrix.map((r) => r.map(() => 1));
  for (let c = 0; c < cols; c += 1) {
    let start = 0;
    for (let r = 1; r <= rows; r += 1) {
      if (r < rows && matrix[r][c] === matrix[start][c]) continue;
      spans[start][c] = r - start;
      for (let k = start + 1; k < r; k += 1) spans[k][c] = 0;
      start = r;
    }
  }
  return spans;
}

/**
 * Merge consecutive equal cells, optionally only while a group key (e.g. strike)
 * stays the same — so Original Side Buy does not bleed across two strike groups.
 */
function spanKey(value: unknown): string {
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (typeof value === "number") return `n:${Object.is(value, -0) ? 0 : value}`;
  return `s:${String(value ?? "")}`;
}

export function computeGroupedRowSpans(
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
  mergeCols: number[],
  groupCol?: number,
): number[][] {
  const rows = matrix.length;
  const cols = rows ? matrix[0].length : 0;
  const spans: number[][] = matrix.map((r) => r.map(() => 1));
  const merge = new Set(mergeCols);
  for (let c = 0; c < cols; c += 1) {
    if (!merge.has(c)) continue;
    let start = 0;
    for (let r = 1; r <= rows; r += 1) {
      const sameValue = r < rows && spanKey(matrix[r]?.[c]) === spanKey(matrix[start]?.[c]);
      const sameGroup =
        groupCol == null ||
        c === groupCol ||
        (r < rows && spanKey(matrix[r]?.[groupCol]) === spanKey(matrix[start]?.[groupCol]));
      if (sameValue && sameGroup) continue;
      spans[start][c] = r - start;
      for (let k = start + 1; k < r; k += 1) spans[k][c] = 0;
      start = r;
    }
  }
  return spans;
}

/**
 * Expand a virtual window so HTML rowSpan merges that stay inside a group column
 * (e.g. Sr. No. / product) are never cut mid-merge by the off-DOM window.
 */
export function expandWindowToGroupBounds(
  matrix: string[][],
  start: number,
  end: number,
  groupCol: number,
): { start: number; end: number } {
  const rows = matrix.length;
  if (rows === 0) return { start: 0, end: 0 };
  let s = Math.max(0, Math.min(start, rows));
  let e = Math.max(s, Math.min(end, rows));
  if (s < rows) {
    const key = matrix[s]![groupCol]!;
    while (s > 0 && matrix[s - 1]![groupCol] === key) s -= 1;
  }
  if (e > 0 && e <= rows) {
    const key = matrix[e - 1]![groupCol]!;
    while (e < rows && matrix[e]![groupCol] === key) e += 1;
  }
  return { start: s, end: e };
}
