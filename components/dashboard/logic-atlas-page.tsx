"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  LineChart,
  Percent,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { LogicFlowDiagram, type FlowNodeSpec } from "@/components/dashboard/logic-flow";
import {
  AppPage,
  Panel,
  SectionTitle,
  SpecRail,
} from "@/components/layout/app-ui";
import { HorizontalBand, HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDeskOptional } from "@/lib/context/multi-desk-provider";
import { cn, computeRowSpans } from "@/lib/utils";

type LogicModule = {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  purpose: string;
  tone: "amber" | "cyan" | "purple" | "green" | "rose" | "gold" | "indigo" | "teal" | "fuchsia";
  metrics: Array<{ label: string; value: string }>;
  insights: string[];
  outputs: string[];
  pipeline: FlowNodeSpec[];
};

const MODULES: LogicModule[] = [
  {
    id: "quote",
    icon: Percent,
    kicker: "Headline",
    title: "Unwind Quote",
    purpose:
      "The number the desk shows when a product is unwound. It adds the grown NBFC holding, the grown credited premium, today's option cost, and the unused margin left on the book.",
    tone: "amber",
    metrics: [
      { label: "Parts", value: "4" },
      { label: "Needs", value: "Date and spot" },
      { label: "Role", value: "Headline number" },
    ],
    insights: [
      "The quote is fully dynamic — every change of unwinding date or spot reprices the options book and the grown values.",
      "The residual margin cost is scaled by remaining tenor over full tenor so a late unwind carries less unused margin.",
      "Pricer Unwind Value equals the Unwind Quote Percent by construction.",
      "Client and Residual internal rates of return are solved from the same quote against invested and residual days.",
    ],
    outputs: [
      "Unwind Quote Percent",
      "Unwind Quote Amount",
      "Pricer Unwind Value",
      "Client Internal Rate of Return",
      "Residual Internal Rate of Return",
    ],
    pipeline: [
      {
        id: "quote-date",
        kind: "input",
        label: "Date and spot",
        description:
          "The unwind date starts as today and can be moved back to allotment. The spot for that date prices every option on the book.",
      },
      {
        id: "quote-nbfc",
        kind: "process",
        label: "Grown NBFC holding",
        description:
          "Cash left with the NBFC after costs, less the margin kept aside. It grows from allotment to the unwind date at the product discount rate.",
      },
      {
        id: "quote-prem",
        kind: "process",
        label: "Grown credited premium",
        description:
          "The premium already credited on the product grows over the same days at the premium discount rate.",
      },
      {
        id: "quote-outflow",
        kind: "process",
        label: "Today's option cost",
        description:
          "Each live option is marked, then those marks are added. The total is shown as a percent of the starting index level.",
      },
      {
        id: "quote-out",
        kind: "output",
        label: "Unwind Quote",
        description:
          "Grown NBFC holding plus grown premium plus today's option cost plus unused margin. Face Value times that percent is the rupee quote.",
      },
    ],
  },
  {
    id: "premium",
    icon: Sigma,
    kicker: "Options Book",
    title: "Option marks",
    purpose:
      "Each option is marked, then those marks are added into the unwind cost. Buying back a sold option is money going out. Selling a bought option is money coming in.",
    tone: "cyan",
    metrics: [
      { label: "Marks", value: "Per leg" },
      { label: "Columns", value: "11" },
      { label: "Role", value: "Option cost" },
    ],
    insights: [
      "Product Premium uses the per-leg Product Price from the Product Master, not a single product-level mark.",
      "Unwind Price is the pricer Buy mark when unwinding a sell, and the Sell mark when unwinding a buy.",
      "Options Book Premium Outflow is holding-scaled quantity times the Pricer buy or sell mark. Product Premium stays on Required Quantity.",
      "An expired Sell put uses put intrinsic on the Options Book; that cash enters Premium Outflow / Unwind Value / quote. Pricer stays 0 after expiry.",
      "Expired Pricer legs show IV 0 with delta zero and no bid-ask shift.",
    ],
    outputs: ["Premium per Leg", "Product Premium", "Unwind Price", "Premium Outflow", "Current Premium Outflow Percent"],
    pipeline: [
      {
        id: "prem-legs",
        kind: "input",
        label: "Option legs",
        description:
          "The product master lists type, strike, spreads, buy or sell, expiry, and quantity for every option on the book.",
      },
      {
        id: "prem-bs",
        kind: "engine",
        label: "Live mark",
        description:
          "Each live option is priced from the day's spot, the vol surface, and the time left to expiry.",
      },
      {
        id: "prem-leg",
        kind: "process",
        label: "Mark per leg",
        description:
          "The price times the number of spreads is shared across legs that match on type, strike, and spreads. An unwind buy is an outflow.",
      },
      {
        id: "prem-sum",
        kind: "process",
        label: "Book total",
        description:
          "Sells add. Buys subtract. Out-of-the-money legs stay marked, so the total moves when spot or date changes.",
      },
      {
        id: "prem-out",
        kind: "output",
        label: "Option cost",
        description:
          "The signed total divided by the starting index level is the percent that enters the Unwind Quote. The rupee outflow still uses quantity times the unwind price.",
      },
    ],
  },
  {
    id: "book",
    icon: Banknote,
    kicker: "Cash book",
    title: "NBFC holding",
    purpose:
      "What is left with the NBFC after costs, the margin kept aside, and the premium already credited. Each piece grows from allotment to the unwind date.",
    tone: "purple",
    metrics: [
      { label: "Figures", value: "7" },
      { label: "Rates", value: "2" },
      { label: "Role", value: "Cash grown" },
    ],
    insights: [
      "NBFC Grown Value is a dual future-value: NBFC amount at the Product Discounting Rate plus margin funds at the margin funding rate.",
      "Premium Credited is the premium fraction of mobilization and grows at the Premium Discounting Rate.",
      "Unwind Value adds NBFC Grown Value, Premium Grown Value and the live Premium Outflow.",
      "Dividing Unwind Value by the total number of debentures recovers the whole-book unwind quote amount.",
    ],
    outputs: [
      "Amount with NBFC Rupees",
      "NBFC Grown Value Rupees",
      "Premium Credited",
      "Premium Grown Value Rupees",
      "Premium Outflow",
      "Unwind Value",
      "Book Unwind Per Debenture",
    ],
    pipeline: [
      {
        id: "book-in",
        kind: "input",
        label: "Amount raised and costs",
        description:
          "Mobilization, costs, and margin funds come from the product master. They do not change when the unwind date moves.",
      },
      {
        id: "book-nbfc",
        kind: "process",
        label: "Cash with the NBFC",
        description:
          "One minus the costs is the share still with the NBFC. In rupees that is mobilization times that share, less the margin kept aside.",
      },
      {
        id: "book-grown",
        kind: "process",
        label: "Grown holding",
        description:
          "The NBFC cash grows at the product discount rate. The margin funds grow at the margin funding rate. Both use days from allotment to unwind.",
      },
      {
        id: "book-prem",
        kind: "process",
        label: "Grown credited premium",
        description:
          "The premium already credited is a share of mobilization. It grows at the premium discount rate over the same days.",
      },
      {
        id: "book-out",
        kind: "output",
        label: "Book unwind value",
        description:
          "Grown NBFC holding plus grown premium plus today's option outflow. Divided by the number of debentures, this matches Face Value times the Unwind Quote.",
      },
    ],
  },
  {
    id: "pricing",
    icon: LineChart,
    kicker: "Pricer",
    title: "Option prices",
    purpose:
      "Live prices use the vol surface and the day's spot. An expired Sell put uses put intrinsic on the Options Book and that cash enters Premium Outflow; Pricer stays Excel 0.",
    tone: "green",
    metrics: [
      { label: "Columns", value: "14" },
      { label: "Discount", value: "Forward plus 1%" },
      { label: "Role", value: "Live prices" },
    ],
    insights: [
      "The pricer discounts at the Forward Sell Rate plus one percent.",
      "Sell Price prices at volatility minus half the Bid Ask Spread; Buy Price prices at volatility plus half the spread.",
      "Delta is a finite difference of one index point around the spot.",
      "An expired Sell put uses put intrinsic on the Options Book; that cash enters Premium Outflow / Unwind Value / quote. Pricer stays 0 after expiry.",
    ],
    outputs: ["Price", "Sell Price", "Buy Price", "Delta", "Volatility", "Discount Yield"],
    pipeline: [
      {
        id: "px-in",
        kind: "input",
        label: "Spot, strike and expiry",
        description:
          "Spot, strike, and expiry set the time left. Each expiry gets its own price and its own delta.",
      },
      {
        id: "px-vol",
        kind: "lookup",
        label: "Vol from the surface",
        description:
          "Volatility is read from the monthly strike and expiry grid, then the month's vol bump is added.",
      },
      {
        id: "px-fwd",
        kind: "process",
        label: "Forward and discount",
        description:
          "Spot is grown at the Forward Sell Rate to expiry. The pricer discounts at that rate plus one percent.",
      },
      {
        id: "px-eng",
        kind: "engine",
        label: "Price the option",
        description:
          "A live put or call is priced on that forward. An expired Sell put uses put intrinsic in Premium Outflow / quote; Pricer stays Excel 0.",
      },
      {
        id: "px-out",
        kind: "output",
        label: "Mid, sell and buy",
        description:
          "Mid uses the surface vol. Sell is a little lower. Buy is a little higher. The unwind mark picks sell or buy from the original side.",
      },
    ],
  },
  {
    id: "irr",
    icon: TrendingUp,
    kicker: "Rates",
    title: "Three rates of return",
    purpose:
      "Product rate is the coupon over the full life. Client rate is what the unwind quote has earned so far. Residual rate is what is left until maturity.",
    tone: "rose",
    metrics: [
      { label: "Rates", value: "3" },
      { label: "Method", value: "Two cash amounts" },
      { label: "Role", value: "Yields" },
    ],
    insights: [
      "The Product rate is independent of the unwind date — it is a property of face value, coupon and full tenor.",
      "The Client rate uses invested days from allotment to unwind, clamped at zero if the unwind is on or before allotment.",
      "The Residual rate grows the unwind quote to the maturity payoff over the remaining days.",
      "A zero tenor returns a zero rate so allotment-day and pre-allotment cases stay finite.",
    ],
    outputs: [
      "Product Internal Rate of Return",
      "Client Internal Rate of Return",
      "Residual Internal Rate of Return",
    ],
    pipeline: [
      {
        id: "irr-in",
        kind: "input",
        label: "Quote and day counts",
        description:
          "The Unwind Quote Amount is paired with three day counts: full life, days already invested, and days left to maturity.",
      },
      {
        id: "irr-prd",
        kind: "process",
        label: "Product rate",
        description:
          "Face Value grows to Face Value plus the contingent coupon over the full life. This rate does not move when the unwind date changes.",
      },
      {
        id: "irr-cli",
        kind: "process",
        label: "Client rate",
        description:
          "Face Value grows to the Unwind Quote Amount over the days already invested. A later date can show a lower rate even if the quote is higher, because more days have passed.",
      },
      {
        id: "irr-res",
        kind: "process",
        label: "Residual rate",
        description:
          "The Unwind Quote Amount grows to the maturity payoff over the days left. An unwind on or before allotment uses zero invested days so the rate stays defined.",
      },
      {
        id: "irr-out",
        kind: "output",
        label: "Three rates",
        description:
          "Product, Client, and Residual rates sit on the Unwind Quote tab.",
      },
    ],
  },
  {
    id: "observations",
    icon: Target,
    kicker: "Active Management",
    title: "Observations and targets",
    purpose:
      "A product's observation dates are its option expiry dates. The desk counts how many have passed, averages the index closes so far, and works out the average the dates still left must print to reach the target.",
    tone: "indigo",
    metrics: [
      { label: "Dates", value: "Option expiries" },
      { label: "Needs", value: "Index closes" },
      { label: "Role", value: "Progress" },
    ],
    insights: [
      "An expiry on the valuation date counts as passed, the same rule that settles expired options.",
      "The index closes are the ones the unwind settles expired options at, so one fetch serves both.",
      "Actual Target is the Target Nifty on the product master. When a product has none, the highest strike among the originally sold puts stands in.",
      "Effective Target shows a dash when nothing is left to observe or a passed close is missing.",
    ],
    outputs: [
      "Observations Passed",
      "Observations Left",
      "Observation Start Date",
      "Observation End Date",
      "Average So Far",
      "Actual Target",
      "Effective Target",
    ],
    pipeline: [
      {
        id: "obs-dates",
        kind: "input",
        label: "Option expiry dates",
        description:
          "The unique expiry dates on the product are its observation dates. The first is the Observation Start Date and the last is the Observation End Date.",
      },
      {
        id: "obs-closes",
        kind: "lookup",
        label: "Index closes",
        description:
          "The index close on or before each passed date, from the same feed the unwind uses for expired options.",
      },
      {
        id: "obs-count",
        kind: "process",
        label: "Passed and left",
        description:
          "Dates on or before the valuation date are passed. The rest are left. No date passed and at least one passed are the two Product Book tabs.",
      },
      {
        id: "obs-avg",
        kind: "process",
        label: "Average so far",
        description: "The passed closes are added and divided by the number of dates passed.",
      },
      {
        id: "obs-out",
        kind: "output",
        label: "Effective Target",
        description:
          "Actual Target times all dates, less the passed closes, divided by the dates left. Before the first date it equals the Actual Target.",
      },
    ],
  },
  {
    id: "am-rates",
    icon: Gauge,
    kicker: "Active Management",
    title: "Current and expected rates",
    purpose:
      "Current rate is the client rate capped at the product rate. Expected rate runs the whole unwind again at an assumed index level and caps it the same way.",
    tone: "teal",
    metrics: [
      { label: "Rates", value: "2" },
      { label: "Cap", value: "Product rate" },
      { label: "Needs", value: "Assumed level" },
    ],
    insights: [
      "The cap is the product rate: Face Value grown at the coupon over the full life.",
      "A product with a zero coupon has no cap, so its Current rate is its Client rate.",
      "Expected rate reprices every live option at the assumed level. Expired options keep the closes they settled at.",
      "With no assumed level entered, the desk spot is used and Expected rate equals Current rate.",
      "A quote at or below zero, or an unwind on the allotment date, shows a dash rather than a zero rate.",
    ],
    outputs: ["Current Internal Rate of Return", "Expected Internal Rate of Return"],
    pipeline: [
      {
        id: "amr-in",
        kind: "input",
        label: "Quote and coupon",
        description:
          "The Unwind Quote Amount and Client rate from the live unwind, with the coupon and full life of the product.",
      },
      {
        id: "amr-cur",
        kind: "process",
        label: "Current rate",
        description: "The lower of the Client rate and the Product rate.",
      },
      {
        id: "amr-level",
        kind: "input",
        label: "Assumed level",
        description:
          "Assumed Nifty Level and Assumed Sensex Level on Home. A blank level uses the desk spot.",
      },
      {
        id: "amr-eng",
        kind: "engine",
        label: "Unwind at that level",
        description:
          "The same unwind with only the option spot moved. Date, debentures, surface and settled closes stay as they are.",
      },
      {
        id: "amr-out",
        kind: "output",
        label: "Expected rate",
        description: "The Client rate at the assumed level, capped at the Product rate.",
      },
    ],
  },
  {
    id: "scenario",
    icon: Grid3x3,
    kicker: "Active Management",
    title: "Scenario grid",
    purpose:
      "The selected product is unwound again at twenty-one index levels, one thousand points either side of the valuation-date level in steps of one hundred, with every change in exact rupees.",
    tone: "fuchsia",
    metrics: [
      { label: "Levels", value: "21" },
      { label: "Step", value: "100 points" },
      { label: "Role", value: "What if" },
    ],
    insights: [
      "The centre row is the on-screen unwind, so the grid and the Unwinding Calculator always agree.",
      "Only the option spot moves. The vol surface keeps its reference levels, the way the Pricer Table reads it.",
      "Expired options stay at the closes they settled at, so a product with every option expired has a flat grid.",
      "The grid is worked out when its tab is opened, one level at a time, so the page stays responsive.",
    ],
    outputs: [
      "Unwind Quote",
      "Premium Outflow",
      "Unwind Value",
      "Client Internal Rate of Return",
      "Current Internal Rate of Return",
      "Residual Internal Rate of Return",
    ],
    pipeline: [
      {
        id: "scn-in",
        kind: "input",
        label: "Valuation level",
        description: "The desk spot for the product's index on the unwind date.",
      },
      {
        id: "scn-levels",
        kind: "process",
        label: "Twenty-one levels",
        description: "From one thousand points below to one thousand points above, every hundred points.",
      },
      {
        id: "scn-eng",
        kind: "engine",
        label: "Full unwind per level",
        description: "Each level runs the same unwind as the calculator, with only the option spot moved.",
      },
      {
        id: "scn-diff",
        kind: "process",
        label: "Change from centre",
        description: "Each figure less the centre row. Rupee changes are exact to the paisa.",
      },
      {
        id: "scn-out",
        kind: "output",
        label: "Scenario grid",
        description:
          "Unwind Quote, Premium Outflow, Unwind Value and the rates at every level, each with its change.",
      },
    ],
  },
  {
    id: "inputs",
    icon: FileSpreadsheet,
    kicker: "Files",
    title: "Two uploads",
    purpose:
      "The desk runs on two files: the monthly vol surface, and the product master with facts and option legs.",
    tone: "gold",
    metrics: [
      { label: "Files", value: "2" },
      { label: "Access", value: "Open" },
      { label: "Role", value: "Source files" },
    ],
    insights: [
      "Uploads are open. First load uses the seeded Desk Book; an upload replaces it.",
      "The Volatility Surface month dropdown lists the current calendar month and year only.",
      "Product Master input columns feed the engine; derived columns are recomputed.",
      "MongoDB stores the active product and the latest surface so a refresh restores the desk book.",
    ],
    outputs: ["Active Product Master", "Active Volatility Surface", "Desk Dataset"],
    pipeline: [
      {
        id: "in-vol",
        kind: "input",
        label: "Vol surface",
        description:
          "The monthly strike and expiry grid, plus the vol bump and Forward Sell Rate. Bid-ask spread stays on the calculator inputs.",
      },
      {
        id: "in-mst",
        kind: "input",
        label: "Product master",
        description:
          "Product facts and option legs come from the product master.",
      },
      {
        id: "in-auth",
        kind: "process",
        label: "Check the file",
        description:
          "Headers are checked so the wrong sheet cannot replace the live book. A good upload replaces the book on Home and both calculators.",
      },
      {
        id: "in-db",
        kind: "lookup",
        label: "Saved desk",
        description:
          "The new surface and product are saved as the live desk. If the database is down, the calculators use the built-in samples.",
      },
      {
        id: "in-out",
        kind: "output",
        label: "Live desk",
        description:
          "Unwinding Calculator and Pricer Table read the saved desk on the next run. The product table stays on Home.",
      },
    ],
  },
];

/** `uses: "leg"` runs once per option leg of the open book; a number is a fixed count per product. */
const PRIMITIVES: Array<{ name: string; category: string; uses: "leg" | number; role: string }> = [
  {
    name: "Vol lookup",
    category: "lookup",
    uses: "leg",
    role: "Volatility is read from the strike and expiry grid for every option",
  },
  {
    name: "Option price",
    category: "price",
    uses: "leg",
    role: "Each live option is priced on the forward grown at the Forward Sell Rate",
  },
  {
    name: "Discount rate",
    category: "price",
    uses: "leg",
    role: "Discount is the Forward Sell Rate plus one percent",
  },
  {
    name: "Cash growth",
    category: "growth",
    uses: 3,
    role: "NBFC cash, margin funds, and credited premium grow over the days already invested",
  },
  {
    name: "Rate from two amounts",
    category: "rate",
    uses: 3,
    role: "Product, Client, and Residual rates come from a start amount, an end amount, and a day count",
  },
  {
    name: "Bid-ask shift",
    category: "price",
    uses: "leg",
    role: "Sell is a little cheaper and buy is a little dearer than the mid price",
  },
  {
    name: "Expired option",
    category: "rule",
    uses: "leg",
    role: "An expired put or call settles at intrinsic on the index close on or before its own expiry. Original Sell pays it, Original Buy receives it, and it enters Premium Outflow, Unwind Value and the quote. The Pricer shows 0 after expiry",
  },
  {
    name: "Day count",
    category: "date",
    uses: 3,
    role: "Full life, days invested, and days left drive growth and the three rates",
  },
  {
    name: "Rate cap",
    category: "rate",
    uses: 2,
    role: "Current and Expected rates are capped at the Product rate",
  },
  {
    name: "Scenario level",
    category: "price",
    uses: 21,
    role: "The selected product is unwound at twenty-one index levels, one hundred points apart",
  },
];

const DESK_LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio/unwinding", label: "Unwinding Calculator" },
  { href: "/portfolio/pricer", label: "Pricer Table" },
  { href: "/upload", label: "Upload Files" },
];

const LANES = [
  {
    title: "Unwinding Calculator",
    accent: "#d97706",
    dataLane: "Product facts, option legs, the chosen index, its spot, and the unwind date.",
    valuationPath: "Grown NBFC holding, grown credited premium, unused margin, the three rates, and the rupee book.",
    payoffPath: "Option marks for every strike and expiry. Expired Sell put intrinsic is on the Options Book and in Premium Outflow; Pricer stays Excel 0.",
    signals: ["Unwind Quote", "Client rate", "Option cost", "Book value"],
  },
  {
    title: "Pricer Table",
    accent: "#0ea5e9",
    dataLane: "The vol surface, the month's vol bump, the Forward Sell Rate, and the bid-ask spread.",
    valuationPath: "Each option is priced on the forward. Discount is the Forward Sell Rate plus one percent.",
    payoffPath: "Mid, sell, and buy prices, plus delta, for every strike and expiry.",
    signals: ["Volatility", "Forward", "Discount", "Delta"],
  },
  {
    title: "Active Management",
    accent: "#4f46e5",
    dataLane: "Observation dates, index closes, the product master's target, and the assumed index levels.",
    valuationPath: "Current and Expected rates from the same unwind, and a twenty-one level scenario grid for each product.",
    payoffPath: "Effective Target is the average the observations still left must print to reach the target.",
    signals: ["Effective Target", "Current rate", "Expected rate", "Scenario grid"],
  },
  {
    title: "Upload",
    accent: "#059669",
    dataLane: "The monthly vol surface and the product master. An upload replaces the live desk.",
    valuationPath: "The new files become the live desk and are saved.",
    payoffPath: "Home, Unwinding Calculator, and Pricer Table read that desk on the next run.",
    signals: ["Surface month", "Option legs", "Product price", "Desk book"],
  },
];

const SHELL_TONES: Record<LogicModule["tone"], string> = {
  amber: "intel-pipeline-shell--amber",
  cyan: "intel-pipeline-shell--cyan",
  purple: "intel-pipeline-shell--purple",
  green: "intel-pipeline-shell--green",
  rose: "intel-pipeline-shell--rose",
  gold: "intel-pipeline-shell--gold",
  indigo: "intel-pipeline-shell--indigo",
  teal: "intel-pipeline-shell--teal",
  fuchsia: "intel-pipeline-shell--fuchsia",
};

export function LogicAtlasPage() {
  const { product } = useDataset();
  const multi = useMultiDeskOptional();
  const [selectedId, setSelectedId] = useState<string>(MODULES[0].id);
  const selected = MODULES.find((m) => m.id === selectedId) ?? MODULES[0];
  const totalStages = useMemo(() => MODULES.reduce((s, m) => s + m.pipeline.length, 0), []);
  const liveCount = multi?.products.length ?? 0;
  const bookCount = multi?.allProducts.length || liveCount;
  const productCount = bookCount;
  const legCount = multi
    ? (multi.allProducts.length ? multi.allProducts : multi.products).reduce(
        (sum, item) => sum + item.legs.length,
        0,
      )
    : product?.legs.length ?? 0;

  return (
    <AppPage dense>
      <div className="intel-page">
        <motion.header
          className="intel-hero"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <span className="intel-hero-orb intel-hero-orb--gold" aria-hidden />
          <span className="intel-hero-orb intel-hero-orb--maroon" aria-hidden />
          <p className="intel-hero-kicker relative z-10">Anand Rathi Wealth · Desk Intelligence</p>
          <h2 className="intel-hero-title relative z-10">Intel · Logic Atlas</h2>
          <p className="intel-hero-sub relative z-10">
            How the unwind quote and the Active Management figures are built.
          </p>
          <div className="intel-hero-meta relative z-10">
            <motion.span
              className="intel-hero-badge"
              animate={{
                boxShadow: [
                  "0 0 0 rgba(212,178,76,0)",
                  "0 0 18px rgba(212,178,76,0.35)",
                  "0 0 0 rgba(212,178,76,0)",
                ],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {MODULES.length}/{MODULES.length} pipelines connected
            </motion.span>
            <span className="intel-hero-badge">
              <Wallet className="h-3.5 w-3.5" />
              {productCount > 1
                ? `${productCount.toLocaleString("en-IN")} Products${liveCount && liveCount !== productCount ? ` · ${liveCount.toLocaleString("en-IN")} Live` : ""}`
                : product?.productCode ?? "Loading…"}
            </span>
          </div>
        </motion.header>

        <HorizontalBand>
          <SpecRail
            cards={[
              { label: "Logic Modules", value: String(MODULES.length) },
              { label: "Pipeline Stages", value: String(totalStages) },
              {
                label: productCount > 1 ? "Products On Desk" : "Active Product",
                value:
                  productCount > 1
                    ? productCount.toLocaleString("en-IN")
                    : product?.productName ?? "Loading…",
              },
              {
                label: "Option Legs",
                value: legCount.toLocaleString("en-IN"),
              },
            ]}
          />
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="!p-4 md:!p-5">
            <div className="intel-section-head">
              <div>
                <SectionTitle icon={LayoutDashboard}>Reference Logic Modules</SectionTitle>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  Wider cards · scroll horizontally to browse all {MODULES.length} modules ·
                  each accent is a distinct lane colour
                </p>
              </div>
              <nav aria-label="Desk shortcuts" className="intel-desk-nav">
                {DESK_LINKS.map((link) => (
                  <Link key={link.href} className="intel-desk-link" href={link.href}>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <HorizontalRail className="logic-module-rail mt-4" fillFirst={false} gap="gap-4">
              {MODULES.map((module, index) => (
                <RailCard key={module.id} className="logic-module-rail-item" fillFirst={false}>
                  <motion.button
                    type="button"
                    className={cn(
                      "logic-module-card h-full cursor-pointer text-left",
                      `logic-module-card--${module.tone}`,
                      selectedId === module.id && "logic-module-card--selected",
                    )}
                    initial={{ opacity: 0, y: 18, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -6, scale: 1.018 }}
                    onClick={() => setSelectedId(module.id)}
                  >
                    <span className="logic-module-card__sheen" aria-hidden />
                    <span className="logic-module-card__orb logic-module-card__orb--primary" aria-hidden />
                    <span className="logic-module-card__orb logic-module-card__orb--secondary" aria-hidden />
                    <div className="relative z-10 flex items-start gap-3">
                      <span className="logic-module-card__icon h-12 w-12">
                        <module.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="logic-module-card__kicker">{module.kicker}</p>
                        <h3 className="logic-module-card__title mt-1.5 font-serif text-lg font-bold md:text-xl">
                          {module.title}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400 md:text-[13px]">
                          {module.purpose}
                        </p>
                      </div>
                    </div>
                    <div className="logic-module-card__footer relative z-10 mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="logic-module-card__connected inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                      {module.metrics.map((m) => (
                        <span key={m.label} className="logic-module-metric">
                          <span className="logic-module-metric__label">{m.label}:</span> {m.value}
                        </span>
                      ))}
                    </div>
                  </motion.button>
                </RailCard>
              ))}
            </HorizontalRail>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="!p-4 md:!p-5">
            <div className="intel-section-head">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Active pipeline</p>
                <AnimatePresence mode="wait">
                  <motion.h3
                    key={selected.id}
                    className="mt-1 font-serif text-xl font-bold tracking-tight text-ink md:text-2xl"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28 }}
                  >
                    {selected.title}
                  </motion.h3>
                </AnimatePresence>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                  {selected.purpose}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pipeline complete
              </span>
            </div>
            <div className={cn("intel-pipeline-shell mt-4", SHELL_TONES[selected.tone])}>
              <LogicFlowDiagram nodes={selected.pipeline} />
            </div>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="!p-4 md:!p-5">
            <SectionTitle icon={BarChart3}>Unwinding Desk Command</SectionTitle>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Category lanes — how each screen uses the same desk files
            </p>
            <HorizontalRail className="category-intel-rail mt-4" gap="gap-2">
              {LANES.map((lane) => (
                <RailCard key={lane.title}>
                  <div
                    className="intel-category-card flex h-full flex-col"
                    style={{ ["--category-accent" as string]: lane.accent }}
                  >
                    <div className="flex items-center gap-2 pt-0.5">
                      <span
                        className="intel-category-dot h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ color: lane.accent, backgroundColor: lane.accent }}
                      />
                      <p className="font-bold text-ink">{lane.title}</p>
                    </div>
                    <p className="intel-category-label mt-3">Data lane</p>
                    <p className="text-sm leading-snug text-stone-700 dark:text-stone-300">{lane.dataLane}</p>
                    <p className="intel-category-label mt-2">Valuation</p>
                    <p className="text-sm leading-snug text-stone-700 dark:text-stone-300">{lane.valuationPath}</p>
                    <p className="intel-category-label mt-2">Payoff</p>
                    <p className="text-sm leading-snug text-stone-700 dark:text-stone-300">{lane.payoffPath}</p>
                    <div className="mt-auto flex flex-wrap gap-1 pt-3">
                      {lane.signals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold-dark dark:text-gold"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                </RailCard>
              ))}
            </HorizontalRail>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="!p-4 md:!p-5">
            <SectionTitle icon={Sparkles}>Shared building blocks</SectionTitle>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              The same pieces used across the live book
            </p>
            <div className="desk-table-scroll mt-4 w-full max-h-none">
              <table className="data-table-premium data-table-fill text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left">Block</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Times Used</th>
                    <th className="px-3 py-2 text-left">What It Does</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const matrix = PRIMITIVES.map((row) => [
                      row.name,
                      row.category,
                      row.uses === "leg" ? legCount.toLocaleString("en-IN") : String(row.uses),
                      row.role,
                    ]);
                    const spans = computeRowSpans(matrix);
                    return PRIMITIVES.map((row, i) => (
                      <tr key={row.name} className={i % 2 === 1 ? "data-table-row-alt" : undefined}>
                        {matrix[i]!.map((value, col) => {
                          const span = spans[i]?.[col] ?? 1;
                          if (span === 0) return null;
                          return (
                            <td
                              key={`${row.name}-${col}`}
                              rowSpan={span > 1 ? span : undefined}
                              className={cn(
                                "align-top",
                                col === 0 && "font-semibold",
                                col === 2 && "cell-value text-right tabular-nums",
                                col === 3 && "text-stone-600 dark:text-stone-400",
                              )}
                            >
                              {col === 1 ? (
                                <span className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-dark">
                                  {value}
                                </span>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </Panel>
        </HorizontalBand>
      </div>
    </AppPage>
  );
}
