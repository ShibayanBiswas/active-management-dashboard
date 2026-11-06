const DESK_BLANK = "-";

function finite(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Object.is(v, -0) ? 0 : v;
}

/** Rounds first so a tiny negative never prints as -0.000. */
function rounded(n: number, digits: number): number {
  const r = Number(n.toFixed(digits));
  return r === 0 ? 0 : r;
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  const n = finite(v);
  if (n == null) return DESK_BLANK;
  return rounded(n, digits).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Rates and IRRs: at most three decimals. */
export function formatPct(v: number | null | undefined, digits = 3): string {
  const n = finite(v);
  if (n == null) return DESK_BLANK;
  const d = Math.min(digits, 3);
  return `${rounded(n * 100, d).toFixed(d)}%`;
}

export function formatRupees(v: number | null | undefined, digits = 2): string {
  const n = finite(v);
  if (n == null) return DESK_BLANK;
  return `₹ ${rounded(n, digits).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

const CRORE = 10_000_000;

export function toCrore(v: number | null | undefined): number | null {
  const n = finite(v);
  return n == null ? null : n / CRORE;
}

export function formatCrore(v: number | null | undefined, digits = 3): string {
  return formatNumber(toCrore(v), digits);
}
