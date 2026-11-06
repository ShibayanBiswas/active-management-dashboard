export type OptionType = "Call" | "Put";
export type Side = "Buy" | "Sell";

export type Leg = {
  optionType: OptionType;
  strike: number;
  /** Original trade side. */
  side: Side;
  /** YYYY-MM-DD. */
  expiry: string;
  /** Signed quantity: negative for sold options. */
  quantity: number;
  prdPrice: number | null;
  /** Premium credited at inception; falls back to -prdPrice x quantity. */
  prdPremium: number | null;
};

export type Product = {
  id: string;
  name: string;
  productCode: string | null;
  tradeDate: string | null;
  allotmentDate: string | null;
  maturityDate: string | null;
  tenorDays: number | null;
  mobilisation: number | null;
  initialNifty: number | null;
  contingentLevel: number | null;
  faceValue: number | null;
  coupon: number | null;
  actualTarget: number | null;
  marginPct: number | null;
  ib: number | null;
  tranCost: number | null;
  issuanceCost: number | null;
  prodRate: number | null;
  premRate: number | null;
  marginRate: number | null;
  /** Up to seven observation dates, YYYY-MM-DD. */
  observationDates: string[];
  legs: Leg[];
};

/** Rows are expiries; columns are moneyness x referenceLevel. Vols are percent points. */
export type VolSurface = {
  label: string;
  referenceLevel: number;
  moneyness: number[];
  expiries: string[];
  volsPercent: number[][];
};

export type ChainRow = {
  strike: number;
  callBid: number | null;
  callAsk: number | null;
  callLast: number | null;
  putBid: number | null;
  putAsk: number | null;
  putLast: number | null;
};

export type OptionChain = {
  /** YYYY-MM of the expiry month. */
  month: string;
  expiry: string | null;
  rows: ChainRow[];
};

export type Fixing = { date: string; close: number };

export type BidAskPoint = { expiry: string; spread: number };

export type AsOf = { valuationDate: string; currentNifty: number; assumedNifty: number };

export type DeskData = {
  asOf: AsOf;
  products: Product[];
  surface: VolSurface;
  chains: OptionChain[];
  fixings: Fixing[];
  bidAsk: BidAskPoint[];
  source: "mongo" | "seed";
  /** Fixings fetched live this load. */
  liveFixings: number;
};

export type ScenarioMode = "delta" | "full";

export type DeskInputs = {
  valuationDate: string;
  currentNifty: number;
  assumedNifty: number;
  /** Forward growth for Black Scholes; discount is forward plus discountSpread. */
  forwardRate: number;
  discountSpread: number;
  /** Rate used for the Black Scholes delta. */
  deltaRate: number;
  scenarioMode: ScenarioMode;
};
