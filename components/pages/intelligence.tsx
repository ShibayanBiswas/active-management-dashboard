"use client";

import { ArrowRight, CalendarCheck, Grid3x3, LineChart, Scale, Wallet, type LucideIcon } from "lucide-react";

import { DeskGate } from "@/components/desk/desk-gate";
import { TabHeading } from "@/components/ui/desk-ui";
import { cn } from "@/lib/cn";
import { formatDeskDate } from "@/lib/dates";
import { scenarioLevels, type Book } from "@/lib/engine/book";
import { expectedDifferenceTone } from "@/lib/engine/expected-difference";
import { formatCrore, formatNumber, formatPct } from "@/lib/format";
import type { DeskData, DeskInputs } from "@/lib/types";

type Module = {
  id: string;
  kicker: string;
  title: string;
  tone: "gold" | "purple" | "cyan" | "green" | "amber";
  icon: LucideIcon;
  flow: string[];
  insights: string[];
  outputs: Array<{ label: string; value: string }>;
};

function modules(book: Book, data: DeskData, inputs: DeskInputs): Module[] {
  const rows = book.rows;
  const live = rows.filter((r) => r.lifecycle.status === "Observations Live");
  const pending = rows.reduce((s, r) => s + r.lifecycle.pending, 0);
  const capped = rows.filter((r) => r.unwind.current.irr != null && r.unwind.maxIrr != null && r.unwind.current.irr > r.unwind.maxIrr).length;
  const badMaster = rows.filter((r) => r.unwind.warnings.some((w) => w.includes("Coupon") || w.includes("Tenor"))).length;
  const keys = [...book.keys.values()];
  const liveKeys = keys.filter((k) => !k.expired);
  const quoted = liveKeys.filter((k) => k.marketPrice != null);
  const gaps = quoted.map((k) => Math.abs(k.price - k.marketPrice!));
  const tones = rows.map((r) => expectedDifferenceTone(r.unwind.expected?.difference ?? null, r.product.mobilisation));
  const noOpen = rows.filter((r) => r.legs.every((lv) => lv.priced.expired));
  const noOpenGreen = noOpen.filter((r) => expectedDifferenceTone(r.unwind.expected?.difference ?? null, r.product.mobilisation) === "green").length;
  const levels = scenarioLevels(inputs.currentNifty);
  return [
    {
      id: "observations",
      kicker: "Observations",
      title: "Observation Lifecycle And Residual Target",
      tone: "gold",
      icon: CalendarCheck,
      flow: ["Product Master Observation Dates", "Nifty Close On Each Date", "Average So Far", "Done, Total And Pending", "Residual Target"],
      insights: [
        `${live.length} products have observations live and ${pending} observations are still pending across the book.`,
        "Average So Far is the mean of the Nifty closes on the observation dates already passed.",
        "Residual Target is Target times Total minus Average So Far times Done, divided by Pending; with nothing pending it shows a dash, never a division by zero.",
        "Status is Observations Done when every date is observed, Not Started when none is, and Observations Live in between.",
        "Fixings come from the Nifty close on the date, or the last close before it within a week when the date was a holiday.",
      ],
      outputs: [
        { label: "Observations Live", value: String(live.length) },
        { label: "Pending Observations", value: String(pending) },
        { label: "Fixings Loaded", value: String(data.fixings.length) },
      ],
    },
    {
      id: "pricing",
      kicker: "Pricing",
      title: "Surface Pricing And Market Check",
      tone: "cyan",
      icon: LineChart,
      flow: ["Unique Strike, Expiry, Option, Side", "Surface Vol Interpolated", "Plus Or Minus Bid And Ask Spread", "Black Scholes Price And Delta", "Market Bid And Ask From Option Chains"],
      insights: [
        `${keys.length} unique pricing keys cover ${data.products.reduce((s, p) => s + p.legs.length, 0)} legs; each key is priced once.`,
        "Surface vol is linear in strike within each expiry row, where strikes are moneyness times the reference level, then linear in time between the bracketing expiries.",
        "Model vol is surface vol plus the Bid And Ask Spread for an original Sell and minus it for a Buy.",
        "Price is Black Scholes on the forward: forward is Nifty times e to the forward rate times years, discounted at the forward rate plus the discount spread.",
        "Delta is the Black Scholes delta at the delta rate; expired legs settle at intrinsic value on the Nifty close of the expiry date.",
        "Market price interpolates the option chain between the bracketing strikes: the ask for an original Sell, the bid for a Buy.",
        `Forward ${formatPct(inputs.forwardRate)}, discount ${formatPct(inputs.forwardRate + inputs.discountSpread)}, delta at ${formatPct(inputs.deltaRate)}, all editable under Pricing Parameters.`,
        quoted.length
          ? `${quoted.length} live keys have a market quote; the median model minus market gap is ${formatNumber(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)])}.`
          : "No uploaded option chain covers the live expiries yet.",
      ],
      outputs: [
        { label: "Live Keys", value: String(liveKeys.length) },
        { label: "Quoted Keys", value: String(quoted.length) },
        { label: "Surface", value: data.surface.label },
      ],
    },
    {
      id: "unwind",
      kicker: "Unwind",
      title: "NBFC Book And Capped IRR",
      tone: "purple",
      icon: Wallet,
      flow: ["Net Mobilization", "Grown Mobilization, Premium And Margin", "Plus Option Outflow", "Unwind Price Per Debenture", "IRR Capped At Max IRR"],
      insights: [
        "Net Mobilization is Mobilization times one minus Margin Percent, IB, Transaction Cost and Issuance Cost.",
        "Each pot grows as amount times one plus its rate raised to days since allotment over 365: Net Mobilization at the Product Rate, Premium at the Premium Rate, Margin at the Margin Rate.",
        "Option Outflow is price times signed quantity over every leg, plus simple interest at the Premium Rate on expiry payoffs already settled.",
        "Unwind Price is the grown pots plus Option Outflow, divided by Debentures, where Debentures is Mobilization over Face Value; Exit Value is Unwind Price times Debentures.",
        "IRR is Unwind Price over Face Value raised to 365 over days since allotment, minus one.",
        `Max IRR is one plus Coupon raised to 365 over Tenor Days, minus one; Current IRR and IRR At Assumed Level are capped at it, and ${capped} products are capped today.`,
        badMaster ? `${badMaster} products have a missing or zero Coupon or Tenor in the master and are flagged.` : "Every product has a usable Coupon and Tenor.",
      ],
      outputs: [
        { label: "Exit Value Current In Crore", value: formatCrore(book.totals.exitValueCurrent) },
        { label: "Exit Value Assumed In Crore", value: formatCrore(book.totals.exitValueAssumed) },
        { label: "Capped Products", value: String(capped) },
      ],
    },
    {
      id: "scenarios",
      kicker: "Scenarios",
      title: "Scenario Ladder",
      tone: "green",
      icon: Grid3x3,
      flow: ["Current Nifty Rounded To 100", "Minus 1,000 To Plus 1,500", "Delta Approximation Or Full Reprice", "Unwind Price And IRR Per Level"],
      insights: [
        `The ladder runs from ${formatNumber(levels[0], 0)} to ${formatNumber(levels.at(-1)!, 0)} in 26 steps of 100.`,
        "Delta Approximation prices each live key at the max of zero and price plus the level move times delta; Full Black Scholes Reprice prices the key again at that level.",
        "Expired legs keep their settled value at every level.",
      ],
      outputs: [
        { label: "Mode", value: inputs.scenarioMode === "delta" ? "Delta Approximation" : "Full Black Scholes Reprice" },
        { label: "Levels", value: "26" },
      ],
    },
    {
      id: "expected",
      kicker: "Debug",
      title: "Expected Difference At Maturity",
      tone: "amber",
      icon: Scale,
      flow: ["Grown Mobilization, Premium And Margin", "Grown To Maturity At Their Rates", "Minus Face Value Times One Plus Coupon Times Debentures", "Minus Open Option Outflow Grown At Premium Rate"],
      insights: [
        "If the residual tenure earns interest only, this is what the book has left at maturity after redemption and the still open option outflow.",
        "Interest Only Book At Maturity is each grown pot grown again at its own rate for the days from valuation to maturity.",
        "Contractual Terminal is Face Value times one plus Coupon times Debentures, the Unwinding Calculator redemption convention.",
        "Expected Difference is Interest Only Book At Maturity minus Contractual Terminal minus the open option outflow grown to maturity at the Premium Rate.",
        `${noOpenGreen} of ${noOpen.length} products with no open legs read close to zero; anything else points at the master rates, costs or coupon.`,
        `${tones.filter((t) => t === "red").length} products are red, ${tones.filter((t) => t === "amber").length} amber and ${tones.filter((t) => t === "green").length} green.`,
      ],
      outputs: [
        { label: "Book Total In Crore", value: formatCrore(book.totals.expectedDifference) },
        { label: "Red Products", value: String(tones.filter((t) => t === "red").length) },
      ],
    },
  ];
}

function ModuleCard({ m }: { m: Module }) {
  const Icon = m.icon;
  return (
    <article className={cn("logic-module-card", `logic-module-card--${m.tone}`)}>
      <span className="logic-module-card__sheen" aria-hidden />
      <span className="logic-module-card__orb logic-module-card__orb--primary" aria-hidden />
      <div className="relative z-10 flex items-start gap-3">
        <span className="logic-module-card__icon h-10 w-10">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="logic-module-card__kicker font-ui">{m.kicker}</p>
          <h3 className="logic-module-card__title font-serif text-lg font-bold">{m.title}</h3>
        </div>
      </div>
      <div className="relative z-10 mt-4">
        <p className="intel-category-label font-ui">Flows</p>
        <div className={cn("intel-pipeline-shell mt-2 flex flex-wrap items-center gap-1.5 font-ui text-xs", `intel-pipeline-shell--${m.tone}`)}>
          {m.flow.map((step, i) => (
            <span key={step} className="inline-flex items-center gap-1.5">
              <span className="desk-chip">{step}</span>
              {i < m.flow.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-gold-dark" /> : null}
            </span>
          ))}
        </div>
      </div>
      <div className="relative z-10 mt-4">
        <p className="intel-category-label font-ui">Insights</p>
        <ul className="intel-insight-list">
          {m.insights.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="logic-module-card__footer relative z-10 mt-4">
        <p className="intel-category-label font-ui">Outputs</p>
        <div className="mt-2 grid gap-2 font-ui sm:grid-cols-3">
          {m.outputs.map((o) => (
            <div key={o.label} className={cn("intel-output-chip", `intel-output-chip--${m.tone}`)}>
              <p className="text-[11px] text-muted">{o.label}</p>
              <p className="font-bold">{o.value}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function IntelligencePage() {
  return (
    <DeskGate>
      {({ book, data, inputs }) => (
        <div className="intel-page">
          <TabHeading title="Logic Atlas" subtitle="How the desk turns the master, the surface and the Nifty into the Book Summary: flows, live insights and outputs." />
          <section className="intel-hero">
            <span className="intel-hero-orb intel-hero-orb--gold" aria-hidden />
            <span className="intel-hero-orb intel-hero-orb--maroon" aria-hidden />
            <div className="relative z-10">
              <p className="intel-hero-kicker">Active Management Desk</p>
              <p className="intel-hero-title">Valuation {formatDeskDate(inputs.valuationDate)} · Nifty {formatNumber(inputs.currentNifty)}</p>
              <p className="intel-hero-sub">
                {book.totals.products} products, {formatCrore(book.totals.mobilisation)} crore mobilized, priced on the {data.surface.label} with {data.chains.length} option chains.
              </p>
              <div className="intel-hero-meta">
                <span className="intel-hero-badge">{data.source === "mongo" ? "Live Book" : "Demo Book"}</span>
                <span className="intel-hero-badge">{data.fixings.length} Fixings</span>
              </div>
            </div>
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            {modules(book, data, inputs).map((m) => (
              <ModuleCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}
    </DeskGate>
  );
}
