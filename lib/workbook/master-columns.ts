/**
 * Canonical Product Master input headers — sample workbooks and uploaded XLSM/XLSX files.
 * The web desk table uses {@link DESK_MASTER_HEADERS} (Contingent Level omitted).
 */
export const PRODUCT_MASTER_HEADERS = [
  "Product Name",
  "Trade Date",
  "Product Code",
  "Mobilization Amount",
  "Unwinds",
  "Initial Underlying Level",
  "Contingent Level",
  "Allotment Date",
  "Tenor Days",
  "Maturity Date",
  "Product Discount Rate",
  "Premium Discount Rate",
  "Payoff Formula",
  "Contingent Coupon",
  "Option Type",
  "Strike Price",
  "Spreads",
  "Original Buy or Sell",
  "Option Expiry Date",
  "Required Quantity",
  "Product Price",
  "Reported Inbuilt",
  "Transaction Cost",
  "Issuance Cost",
  "Margin Cost",
  "Face Value",
  "Total Funds For Margin",
  "Margin Funding Rate",
] as const;

export type ProductMasterHeader = (typeof PRODUCT_MASTER_HEADERS)[number];

export const PRODUCT_MASTER_COL = {
  productName: 0,
  tradeDate: 1,
  productCode: 2,
  mobilization: 3,
  unwinds: 4,
  initialNiftyLevel: 5,
  contingentLevel: 6,
  allotmentDate: 7,
  tenorDays: 8,
  maturityDate: 9,
  prdDiscRate: 10,
  premDiscRate: 11,
  formulae: 12,
  coupon: 13,
  optionType: 14,
  strike: 15,
  spreads: 16,
  originalSide: 17,
  expiry: 18,
  reqQuantity: 19,
  prdPrice: 20,
  inbuilt: 21,
  tranCost: 22,
  issuanceCost: 23,
  marginCost: 24,
  faceValue: 25,
  totalFundsForMargin: 26,
  marginFundingRate: 27,
} as const;

/** 1-based Excel column indexes matching PRODUCT_MASTER_HEADERS. */
export const PRODUCT_MASTER_EXCEL_COL = Object.fromEntries(
  Object.entries(PRODUCT_MASTER_COL).map(([key, index]) => [key, index + 1]),
) as Record<keyof typeof PRODUCT_MASTER_COL, number>;

export const PRODUCT_MASTER_NUMERIC_COLS = new Set([3, 4, 5, 6, 8, 15, 16, 19, 20, 25, 26]);
export const PRODUCT_MASTER_PCT_COLS = new Set([10, 11, 13, 21, 22, 23, 24, 27]);
export const PRODUCT_MASTER_DATE_COLS = new Set([1, 7, 9, 18]);
export const PRODUCT_MASTER_LEG_COLS = new Set([14, 15, 16, 17, 18, 19, 20]);

/** Web desk Product Master table — omits Contingent Level (equals Initial Underlying Level). */
export const DESK_MASTER_HEADERS = PRODUCT_MASTER_HEADERS.filter((h) => h !== "Contingent Level");

export type DeskMasterHeader = (typeof DESK_MASTER_HEADERS)[number];

/** Map a desk table column index to the canonical Product Master column index. */
export function deskColToMasterCol(deskCol: number): number {
  const contingent = PRODUCT_MASTER_COL.contingentLevel;
  return deskCol >= contingent ? deskCol + 1 : deskCol;
}

/** Map a Product Master column index to the desk table column index (-1 when hidden). */
export function masterColToDeskCol(masterCol: number): number {
  const contingent = PRODUCT_MASTER_COL.contingentLevel;
  if (masterCol === contingent) return -1;
  return masterCol > contingent ? masterCol - 1 : masterCol;
}

export const DESK_MASTER_NUMERIC_COLS = new Set(
  [...PRODUCT_MASTER_NUMERIC_COLS].map(masterColToDeskCol).filter((c) => c >= 0),
);
export const DESK_MASTER_PCT_COLS = new Set(
  [...PRODUCT_MASTER_PCT_COLS].map(masterColToDeskCol).filter((c) => c >= 0),
);
export const DESK_MASTER_DATE_COLS = new Set(
  [...PRODUCT_MASTER_DATE_COLS].map(masterColToDeskCol).filter((c) => c >= 0),
);
export const DESK_MASTER_LEG_COLS = new Set(
  [...PRODUCT_MASTER_LEG_COLS].map(masterColToDeskCol).filter((c) => c >= 0),
);
