import { headerKey, toIso, toNumber, type Cell, type Sheet } from "@/lib/workbook/sheet-reader";
import type { BidAskPoint, ChainRow, Fixing, VolSurface } from "@/lib/types";

/**
 * Volatility surface: a header row whose first cell is Expiry (or Reference Level) followed by moneyness percents,
 * then one row per expiry. The reference level is a "Reference Level" label cell followed by the level, or the 100
 * percent cell of the row under the header. A sheet with Expiry and Spread columns supplies the bid ask table.
 */
export function parseSurface(sheets: Sheet[], label: string): { surface: VolSurface | null; bidAsk: BidAskPoint[]; issues: string[] } {
  const issues: string[] = [];
  let surface: VolSurface | null = null;
  const bidAsk: BidAskPoint[] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows;
    let reference: number | null = null;
    for (const row of rows.slice(0, 10)) {
      const at = row.findIndex((c) => headerKey(c) === "referencelevel");
      if (at >= 0 && toNumber(row[at + 1]) != null && toNumber(row[at + 2]) == null) reference = toNumber(row[at + 1]);
    }
    const headerAt = rows.findIndex((row) => {
      const key = headerKey(row[0]);
      const numbers = row.slice(1).map(toNumber).filter((n) => n != null);
      return (key === "expiry" || key === "referencelevel") && numbers.length >= 3;
    });
    if (!surface && headerAt >= 0) {
      const header = rows[headerAt];
      const cols: number[] = [];
      const moneyness: number[] = [];
      header.forEach((c, i) => {
        const v = i > 0 ? toNumber(c) : null;
        if (v != null && !moneyness.includes(v / 100)) {
          cols.push(i);
          moneyness.push(v / 100);
        }
      });
      if (reference == null) {
        const hundred = moneyness.findIndex((m) => Math.abs(m - 1) < 1e-9);
        const strikeRow = rows[headerAt + 1] ?? [];
        if (hundred >= 0 && !toIso(strikeRow[0])) reference = toNumber(strikeRow[cols[hundred]]);
      }
      const expiries: string[] = [];
      const volsPercent: number[][] = [];
      for (const row of rows.slice(headerAt + 1)) {
        const expiry = toIso(row[0]);
        if (!expiry) continue;
        const vols = cols.map((c) => toNumber(row[c]));
        if (vols.some((v) => v == null)) {
          issues.push(`Expiry ${expiry} Has Blank Vols And Was Skipped`);
          continue;
        }
        expiries.push(expiry);
        volsPercent.push(vols as number[]);
      }
      if (reference == null || reference <= 0) issues.push("Reference Level Not Found");
      else if (!expiries.length) issues.push("No Expiry Rows Found");
      else surface = { label, referenceLevel: reference, moneyness, expiries, volsPercent };
    }
    const spreadHeader = rows.findIndex((row) => row.some((c) => headerKey(c).includes("spread")) && row.some((c) => headerKey(c).startsWith("expiry")));
    if (spreadHeader >= 0) {
      const head = rows[spreadHeader];
      const e = head.findIndex((c) => headerKey(c).startsWith("expiry"));
      const s = head.findIndex((c) => headerKey(c).includes("spread"));
      for (const row of rows.slice(spreadHeader + 1)) {
        const expiry = toIso(row[e]);
        const spread = toNumber(row[s]);
        if (expiry && spread != null) bidAsk.push({ expiry, spread });
      }
    }
  }
  if (!surface && !issues.length) issues.push("No Surface Grid Found");
  return { surface, bidAsk, issues };
}

/** NSE option chain export: CALLS on the left of STRIKE, PUTS on the right. */
export function parseOptionChain(sheets: Sheet[]): { rows: ChainRow[]; issues: string[] } {
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex((row) => row.some((c) => headerKey(c) === "strike"));
    if (headerAt < 0) continue;
    const keys = sheet.rows[headerAt].map(headerKey);
    const s = keys.indexOf("strike");
    const before = (name: string) => keys.lastIndexOf(name, s);
    const after = (name: string) => keys.indexOf(name, s + 1);
    const col = { callBid: before("bid"), callAsk: before("ask"), callLast: before("ltp"), putBid: after("bid"), putAsk: after("ask"), putLast: after("ltp") };
    const rows: ChainRow[] = [];
    for (const row of sheet.rows.slice(headerAt + 1)) {
      const strike = toNumber(row[s]);
      if (strike == null || strike <= 0) continue;
      const at = (i: number): Cell => (i >= 0 ? row[i] : null);
      rows.push({
        strike,
        callBid: toNumber(at(col.callBid)),
        callAsk: toNumber(at(col.callAsk)),
        callLast: toNumber(at(col.callLast)),
        putBid: toNumber(at(col.putBid)),
        putAsk: toNumber(at(col.putAsk)),
        putLast: toNumber(at(col.putLast)),
      });
    }
    return { rows: rows.sort((a, b) => a.strike - b.strike), issues: rows.length ? [] : ["No Strike Rows Found"] };
  }
  return { rows: [], issues: ["No Strike Column Found"] };
}

/** Date and Close columns. */
export function parseFixings(sheets: Sheet[]): { fixings: Fixing[]; issues: string[] } {
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex((row) => row.some((c) => headerKey(c) === "date") && row.some((c) => headerKey(c) === "close"));
    if (headerAt < 0) continue;
    const keys = sheet.rows[headerAt].map(headerKey);
    const d = keys.indexOf("date");
    const c = keys.indexOf("close");
    const fixings: Fixing[] = [];
    for (const row of sheet.rows.slice(headerAt + 1)) {
      const date = toIso(row[d]);
      const close = toNumber(row[c]);
      if (date && close != null && close > 0) fixings.push({ date, close });
    }
    return { fixings, issues: fixings.length ? [] : ["No Fixing Rows Found"] };
  }
  return { fixings: [], issues: ["Date And Close Columns Not Found"] };
}
