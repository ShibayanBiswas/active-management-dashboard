export type OptionSide = "Buy" | "Sell";
export type OptionKind = "Put" | "Call";

export type PricingParamPoint = {
  date: string;
  volBump: number;
  fwdSellRate: number;
};

export type VolSurface = {
  monthKey: string;
  label: string;
  deepStrike: number;
  moneyness: number[];
  /** Strikes aligned to D..W (deep + moneyness strikes) */
  strikes: number[];
  expiries: string[];
  /** vols as percent points e.g. 13.39 = 13.39% */
  volsPercent: number[][];
  pricingParams: PricingParamPoint[];
  /**
   * Monthly 100% Nifty strike anchor from Surface Parameters (Strike Change percents × this price).
   * Vol interpolation uses percent × the matching index reference; Black–Scholes still uses the live unwind spot.
   */
  referenceUnderlyingPrice?: number;
  /** Monthly 100% Sensex strike anchor (August 2026: 78,094.64 as of 1 Aug 2026). */
  referenceSensexPrice?: number;
  /** Default bid-ask vol spread from the monthly input file. */
  bidAskSpread?: number;
};

export type OptionLeg = {
  optionType: OptionKind | string;
  strike: number;
  spreads: number;
  originalSide: OptionSide | string;
  expiry: string;
  reqQuantity?: number;
  sdCode?: string;
  /** Per-leg product price used for the Product Premium column. */
  prdPrice?: number;
  unwindPrice?: number | null;
  /** Quantity divisor (1 = full, 3 = one third for most quarterly legs). */
  qtyDivisor?: number;
};

export type ProductMaster = {
  productName: string;
  productCode: string;
  tradeDate: string;
  allotmentDate: string;
  maturityDate: string;
  deltaDate: string;
  tenorDays: number;
  mobilization: number;
  unwinds: number;
  initialNiftyLevel: number;
  contingentLevel: number;
  prdDiscRate: number;
  premDiscRate: number;
  formulae: string;
  coupon: number;
  faceValue: number;
  inbuilt: number;
  tranCost: number;
  issuanceCost: number;
  marginCost: number;
  marginFundingRate: number;
  totalFundsForMargin: number;
  prdPrice: number;
  /** Option book premium as fraction of mobilization. */
  premiumFraction?: number;
  legs: OptionLeg[];
};

export type UnderlyingIndex = "Nifty" | "Sensex";

export type UnwindInputs = {
  productName?: string;
  productCode?: string;
  debentures: number;
  unwindDate: string;
  /** Pricing spot for the chosen underlying. */
  spot: number;
  sensex?: number | null;
  nifty?: number | null;
  /** Defaults from the product name: Sensex if the name matches Sensex / BSE Sensex, otherwise Nifty. */
  underlying?: UnderlyingIndex | "";
  /** Bid-ask vol spread, default 0. */
  bidAskSpread?: number;
  /** Index close on/before each expired leg expiry (YYYY-MM-DD → spot). */
  expirySpots?: Record<string, number>;
};

export type OptionTableRow = {
  options: string;
  strike: number;
  spreads: number;
  original: string;
  unwind: string;
  expiry: string;
  quantity: number;
  currentPrice: number | null;
  /** Calculator signed premium used for Current Premium Outflow percent. */
  premium: number | null;
  /** Product Master Product Price — the Options Book Product Premium Per Spread, unsigned. */
  premiumPerSpread: number | null;
  /** Master SD Codes column. */
  sdCode: string;
  /** Master Unwind Action (flip of original). */
  unwindAction: string;
  /** Master Prd Premium = PrdPrice × −ReqQuantity. */
  prdPremium: number;
  /** Dynamic full-column BS unwind price (Master Unwind Prices). */
  unwindPrice: number;
  /** Dynamic full-column Premium Outflow Rs = UnwindPrice × ReqQuantity. */
  premiumOutflowRs: number;
  /** True when τ ≤ 0 on the unwinding date (desk expired-put rules apply). */
  expired: boolean;
};

/** Whole-book rupee economics, computed dynamically. */
export type MasterEconomics = {
  premiumCreditedRs: number;
  premiumOutflowRs: number;
  amtWithNbfcRs: number;
  grownValueRs: number;
  premGrownValueRs: number;
  unwindValueRs: number;
  unwindQuoteRs: number;
};

export type UnwindResult = {
  productName: string;
  productCode: string;
  debentures: number;
  faceValue: number;
  inbuilt: number;
  tranCost: number;
  issuanceCost: number;
  marginCost: number;
  initialNiftyLevel: number;
  contingentLevel: number;
  deltaDate: string;
  allotmentDate: string;
  unwindDate: string;
  underlying?: UnderlyingIndex | "";
  contingentCoupon: number;
  tenorDays: number;
  residualTenor: number;
  maturityDate: string;
  spot: number;

  unwindQuotePct: number;
  unwindQuoteRs: number;
  productIRR: number;
  clientIRR: number;
  residualIRR: number;

  totalDebs: number;
  amountWithNbfc: number;
  discountingRate: number;
  nbfcGrownValue: number;
  premium: number;
  premiumRate: number;
  premiumGrownValue: number;
  investedTenorDays: number;
  currentPremOutflowPct: number;
  pricerUnwindValue: number;
  bidAskSpread: number;

  masterEconomics: MasterEconomics;
  optionRows: OptionTableRow[];
};

export type PricerRow = {
  code: string;
  strike: number;
  maturity: string;
  valuationDate: string;
  optionType: string;
  spot: number;
  forwardGrowth: number;
  discountYield: number;
  volatility: number;
  volBump: number;
  bidOffer: number;
  price: number;
  sellPrice: number;
  buyPrice: number;
  delta: number;
  /** True when valuation date is on/after expiry — price, sell, and buy are 0. */
  expired: boolean;
};
