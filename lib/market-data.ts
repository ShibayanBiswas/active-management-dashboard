import { daysBetween, deskTodayISO } from "@/lib/dates";

type MarketLevels = {
  /** Trading day the selected close belongs to (YYYY-MM-DD, IST). */
  priceAsOfDate: string | null;
  niftyLevel: number | null;
  fetchedAt: string;
  source: "yahoo" | "unavailable";
};

type DatedClose = { ymd: string; ts: number; close: number };

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { previousClose?: number; chartPreviousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

const NIFTY = "^NSEI";
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"] as const;
/** NSE cash session close, minutes after midnight IST. */
const NSE_CLOSE_MINUTES = 15 * 60 + 30;

function istMinutesSinceMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0") * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? "0");
}

function readCloses(json: YahooChart): DatedClose[] {
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: DatedClose[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ ymd: deskTodayISO(new Date(ts[i] * 1000)), ts: ts[i], close: Math.round(close * 100) / 100 });
  }
  return bars;
}

async function fetchChart(query: string, live: boolean): Promise<YahooChart | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(NIFTY)}?interval=1d&${query}`, {
        headers: { "User-Agent": "Mozilla/5.0 Active-Management-Dashboard/1.0" },
        ...(live ? { cache: "no-store" as const } : { next: { revalidate: 86_400 } }),
      });
      if (!res.ok) continue;
      return (await res.json()) as YahooChart;
    } catch {
      continue;
    }
  }
  return null;
}

/** Completed-session bars only: today's bar counts once the cash session has closed. */
function completedBars(bars: DatedClose[], now: Date): DatedClose[] {
  const today = deskTodayISO(now);
  return istMinutesSinceMidnight(now) >= NSE_CLOSE_MINUTES ? bars : bars.filter((b) => b.ymd < today);
}

/** Last completed Nifty close (never an intraday print while NSE is open). */
export async function fetchLiveMarketLevels(now: Date = new Date()): Promise<MarketLevels> {
  const json = await fetchChart("range=1mo", true);
  const bars = json ? completedBars(readCloses(json), now) : [];
  const last = bars[bars.length - 1];
  return {
    priceAsOfDate: last?.ymd ?? null,
    niftyLevel: last?.close ?? null,
    fetchedAt: now.toISOString(),
    source: last ? "yahoo" : "unavailable",
  };
}

/** Nifty close on or before each date, from one Yahoo chart spanning all of them. */
export async function fetchNiftyClosesOnOrBefore(isoDates: string[], now: Date = new Date()): Promise<Map<string, number>> {
  const dates = [...new Set(isoDates.map((d) => d.slice(0, 10)))].filter(Boolean).sort();
  const out = new Map<string, number>();
  if (!dates.length) return out;
  const period1 = Math.floor(new Date(`${dates[0]}T00:00:00Z`).getTime() / 1000) - 21 * 86_400;
  const period2 = Math.floor(new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() / 1000) + 2 * 86_400;
  const live = dates[dates.length - 1] >= deskTodayISO(now);
  const json = await fetchChart(`period1=${period1}&period2=${period2}`, live);
  if (!json) return out;
  const bars = completedBars(readCloses(json), now);
  for (const iso of dates) {
    let best: DatedClose | null = null;
    for (const bar of bars) if (bar.ymd <= iso && (!best || bar.ts > best.ts)) best = bar;
    if (best && daysBetween(best.ymd, iso) <= 7) out.set(iso, best.close);
  }
  return out;
}
