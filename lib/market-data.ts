import { deskTodayISO } from "@/lib/utils";

export type SpotKind = "today_close" | "prior_close" | "last_close";

export type SessionPhase = "pre_open" | "open" | "closed" | "holiday_or_weekend";

export type MarketLevels = {
  /** Calendar date in Asia/Kolkata when the levels were resolved. */
  valuationDate: string;
  /** Trading day the selected close belongs to (YYYY-MM-DD, IST). */
  priceAsOfDate: string | null;
  /** Which close rule produced the print. */
  spotKind: SpotKind | null;
  /** NSE cash session phase used for the rule. */
  sessionPhase: SessionPhase | null;
  niftyLevel: number | null;
  sensexLevel: number | null;
  fetchedAt: string;
  source: "yahoo" | "unavailable";
};

export type DailyBar = {
  dateYmd: string;
  close: number;
};

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"] as const;
const IST = "Asia/Kolkata";
/** NSE cash equity regular session close (IST). */
const NSE_CLOSE_MINUTES = 15 * 60 + 30;
/** NSE cash equity regular session open (IST). */
const NSE_OPEN_MINUTES = 9 * 60 + 15;

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

function roundLevel(n: number): number {
  return Math.round(n * 100) / 100;
}

/** YYYY-MM-DD in Asia/Kolkata for a Date or unix seconds. */
export function istYmd(input: Date | number): string {
  const d = typeof input === "number" ? new Date(input * 1000) : input;
  return deskTodayISO(d);
}

/** Minutes since midnight in Asia/Kolkata. */
export function istMinutesSinceMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function istWeekday(now: Date): number {
  // 0 = Sunday … 6 = Saturday in IST
  const w = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(now);
  switch (w) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return now.getUTCDay();
  }
}

/**
 * Desk spot rule (NSE cash):
 * - Session finished (after 15:30 IST) on a day with a Yahoo bar → today's close.
 * - Session still open / pre-open / weekend / holiday → last completed trading-day close
 *   (never an intra-day print while the cash market is live).
 */
export function pickDeskClose(
  bars: DailyBar[],
  now: Date = new Date(),
): {
  close: number;
  priceAsOfDate: string;
  spotKind: SpotKind;
  sessionPhase: SessionPhase;
} | null {
  const valid = bars.filter((b) => Number.isFinite(b.close) && b.close > 0);
  if (valid.length === 0) return null;

  const today = istYmd(now);
  const minutes = istMinutesSinceMidnight(now);
  const weekday = istWeekday(now);
  const isWeekend = weekday === 0 || weekday === 6;
  const afterClose = minutes >= NSE_CLOSE_MINUTES;
  const beforeOpen = minutes < NSE_OPEN_MINUTES;

  const last = valid[valid.length - 1]!;
  const prior = valid.length >= 2 ? valid[valid.length - 2]! : null;

  if (afterClose) {
    if (last.dateYmd === today) {
      return {
        close: roundLevel(last.close),
        priceAsOfDate: today,
        spotKind: "today_close",
        sessionPhase: "closed",
      };
    }
    return {
      close: roundLevel(last.close),
      priceAsOfDate: last.dateYmd,
      spotKind: "last_close",
      sessionPhase: "holiday_or_weekend",
    };
  }

  // Before / during the cash session: never use today's incomplete bar.
  if (last.dateYmd === today && prior) {
    const phase: SessionPhase = isWeekend
      ? "holiday_or_weekend"
      : beforeOpen
        ? "pre_open"
        : "open";
    return {
      close: roundLevel(prior.close),
      priceAsOfDate: prior.dateYmd,
      spotKind: "prior_close",
      sessionPhase: phase,
    };
  }

  const phase: SessionPhase =
    isWeekend || last.dateYmd !== today
      ? "holiday_or_weekend"
      : beforeOpen
        ? "pre_open"
        : "open";

  return {
    close: roundLevel(last.close),
    priceAsOfDate: last.dateYmd,
    spotKind: "prior_close",
    sessionPhase: phase,
  };
}

function readDailyBars(json: YahooChart): DailyBar[] {
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ dateYmd: istYmd(ts[i]!), close });
  }
  return bars;
}

/** Fallback when daily bars are thin: the meta previous close (never the live intraday print). */
function readMetaFallback(json: YahooChart): number | null {
  const meta = json.chart?.result?.[0]?.meta;
  const prev = meta?.previousClose ?? meta?.chartPreviousClose;
  if (prev != null && Number.isFinite(prev) && prev > 0) return roundLevel(prev);
  return null;
}

async function fetchYahooChart(symbol: string, range: string): Promise<YahooChart | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 Unwinding-Calculator/1.0" },
          cache: "no-store",
        },
      );
      if (!res.ok) continue;
      return (await res.json()) as YahooChart;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchYahooDeskClose(
  symbol: string,
  now: Date,
): Promise<{
  close: number;
  priceAsOfDate: string;
  spotKind: SpotKind;
  sessionPhase: SessionPhase;
} | null> {
  const json = await fetchYahooChart(symbol, "1mo");
  if (!json) return null;
  const picked = pickDeskClose(readDailyBars(json), now);
  if (picked) return picked;
  const fallback = readMetaFallback(json);
  if (fallback == null) return null;
  return {
    close: fallback,
    priceAsOfDate: istYmd(now),
    spotKind: "last_close",
    sessionPhase: "holiday_or_weekend",
  };
}

type DatedClose = { ymd: string; ts: number; close: number };

const rangeCache = new Map<string, DatedClose[]>();

function readDatedCloses(json: YahooChart): DatedClose[] {
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: DatedClose[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const close = closes[i];
    const stamp = ts[i];
    if (stamp == null || close == null || !Number.isFinite(close) || close <= 0) continue;
    bars.push({ ymd: istYmd(stamp), ts: stamp, close: roundLevel(close) });
  }
  return bars;
}

/** `live`: the range reaches today, whose bar is still changing, so nothing is cached. */
async function fetchYahooBars(
  symbol: string,
  period1: number,
  period2: number,
  live = false,
): Promise<DatedClose[]> {
  const key = `${symbol}|${period1}|${period2}`;
  const cached = live ? undefined : rangeCache.get(key);
  if (cached) return cached;
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 Unwinding-Calculator/1.0" },
          ...(live ? { cache: "no-store" as const } : { next: { revalidate: 86_400 } }),
        },
      );
      if (!res.ok) continue;
      const bars = readDatedCloses((await res.json()) as YahooChart);
      if (!live) rangeCache.set(key, bars);
      return bars;
    } catch {
      continue;
    }
  }
  return [];
}

function closeOnOrBefore(bars: DatedClose[], isoDate: string): number | null {
  let bestTs = -1;
  let best: number | null = null;
  for (const bar of bars) {
    if (bar.ymd <= isoDate && bar.ts >= bestTs) {
      bestTs = bar.ts;
      best = bar.close;
    }
  }
  return best;
}

async function fetchYahooCloseOnOrBefore(symbol: string, isoDate: string): Promise<number | null> {
  const found = await fetchYahooClosesOnOrBefore(symbol, [isoDate]);
  return found.get(isoDate.slice(0, 10)) ?? null;
}

/**
 * One Yahoo chart for every expiry in the book. The bar is chosen by its India
 * calendar date, so the next session cannot be used as this expiry's close.
 */
export async function fetchYahooClosesOnOrBefore(
  symbol: string,
  isoDates: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const dates = [...new Set(isoDates.map((day) => day.slice(0, 10)))].filter(Boolean).sort();
  const out = new Map<string, number>();
  if (!dates.length) return out;
  const start = new Date(`${dates[0]}T00:00:00Z`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  // Three weeks before the first expiry covers a holiday week.
  const period1 = Math.floor(start.getTime() / 1000) - 21 * 86_400;
  const period2 = Math.floor(end.getTime() / 1000) + 2 * 86_400;
  // Today's bar is a close only once the cash session has ended (same rule as pickDeskClose).
  const today = istYmd(now);
  const reachesToday = dates[dates.length - 1]! >= today;
  const sessionDone = istMinutesSinceMidnight(now) >= NSE_CLOSE_MINUTES;
  const fetched = await fetchYahooBars(symbol, period1, period2, reachesToday);
  const bars = sessionDone ? fetched : fetched.filter((bar) => bar.ymd < today);
  for (const iso of dates) {
    const close = closeOnOrBefore(bars, iso);
    if (close != null) out.set(iso, close);
  }
  return out;
}

/**
 * Desk Nifty 50 (^NSEI) and BSE Sensex (^BSESN) spots.
 * Uses completed session closes only — never an intra-day print while NSE is open.
 */
export async function fetchLiveMarketLevels(now: Date = new Date()): Promise<MarketLevels> {
  const [niftyPick, sensexPick] = await Promise.all([
    fetchYahooDeskClose("^NSEI", now),
    fetchYahooDeskClose("^BSESN", now),
  ]);

  const niftyLevel = niftyPick?.close ?? null;
  const sensexLevel = sensexPick?.close ?? null;
  const primary = niftyPick ?? sensexPick;

  return {
    valuationDate: istYmd(now),
    priceAsOfDate: primary?.priceAsOfDate ?? null,
    spotKind: primary?.spotKind ?? null,
    sessionPhase: primary?.sessionPhase ?? null,
    niftyLevel,
    sensexLevel,
    fetchedAt: now.toISOString(),
    source: niftyLevel != null || sensexLevel != null ? "yahoo" : "unavailable",
  };
}

/** Historical close on/before date via Yahoo chart range. */
export async function fetchIndexAtDate(isoDate: string): Promise<{
  niftyLevel: number | null;
  sensexLevel: number | null;
  source: string;
  priceAsOfDate: string | null;
  spotKind: SpotKind | null;
}> {
  const day = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) {
    return {
      niftyLevel: null,
      sensexLevel: null,
      source: "invalid",
      priceAsOfDate: null,
      spotKind: null,
    };
  }

  const [niftyLevel, sensexLevel] = await Promise.all([
    fetchYahooCloseOnOrBefore("^NSEI", isoDate),
    fetchYahooCloseOnOrBefore("^BSESN", isoDate),
  ]);
  return {
    niftyLevel,
    sensexLevel,
    source: niftyLevel != null || sensexLevel != null ? "yahoo" : "missing",
    priceAsOfDate: isoDate,
    spotKind: "last_close",
  };
}
