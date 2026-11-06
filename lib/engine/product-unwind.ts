import { daysBetween } from "@/lib/dates";
import { expectedDifferenceAtMaturity, type ExpectedDifference } from "@/lib/engine/expected-difference";
import type { PricedKey } from "@/lib/engine/leg-pricing";
import { grow, rateZeroCoupon } from "@/lib/engine/rates";
import type { Leg, Product } from "@/lib/types";

export type LegValue = {
  leg: Leg;
  priced: PricedKey;
  /** price x signed quantity: negative is money the book owes. */
  outflow: number;
  /** Simple interest on an expired leg's settled payoff, valuation minus expiry, at the premium rate. */
  grownOutflow: number;
};

export type UnwindAtLevel = {
  premiumOutflow: number;
  unwindPrice: number | null;
  irr: number | null;
  cappedIrr: number | null;
  exitValue: number | null;
};

export type ProductUnwind = {
  daysInvested: number;
  residualDays: number | null;
  netMobilisation: number | null;
  grownMobilisation: number | null;
  premium: number;
  grownPremium: number | null;
  margin: number | null;
  grownMargin: number | null;
  debentures: number | null;
  maxIrr: number | null;
  current: UnwindAtLevel;
  /** Settled payoffs of expired legs (negative is paid out), carried to valuation. */
  realisedOutflow: number;
  /** Open legs at valuation (negative is owed). */
  openOutflow: number;
  expected: ExpectedDifference | null;
  warnings: string[];
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function legPremium(leg: Leg): number {
  if (leg.prdPremium != null && Number.isFinite(leg.prdPremium)) return leg.prdPremium;
  if (leg.prdPrice != null && Number.isFinite(leg.prdPrice)) return -leg.prdPrice * leg.quantity;
  return 0;
}

export function maxIrr(coupon: number | null, tenorDays: number | null): number | null {
  if (coupon == null || tenorDays == null || !(tenorDays > 0) || !(coupon > -1)) return null;
  return Math.pow(1 + coupon, 365 / tenorDays) - 1;
}

export function capIrr(irr: number | null, cap: number | null): number | null {
  if (irr == null) return null;
  return cap == null ? irr : Math.min(irr, cap);
}

export function valueLegs(product: Product, priced: Map<string, PricedKey>, keyOf: (leg: Leg) => string, valuationDate: string): LegValue[] {
  const premRate = n(product.premRate) ?? 0;
  return product.legs.map((leg) => {
    const p = priced.get(keyOf(leg))!;
    const outflow = p.price * leg.quantity;
    const grownOutflow = p.expired ? (outflow * premRate * Math.max(0, daysBetween(leg.expiry, valuationDate))) / 365 : 0;
    return { leg, priced: p, outflow, grownOutflow };
  });
}

/** The unwind chain: book value per debenture, the IRR since allotment and the capped IRR, for one option outflow. */
function atOutflow(base: { book: number | null; debentures: number | null; face: number | null; days: number; maxIrr: number | null }, premiumOutflow: number): UnwindAtLevel {
  if (base.book == null || base.debentures == null || !(base.debentures > 0)) {
    return { premiumOutflow, unwindPrice: null, irr: null, cappedIrr: null, exitValue: null };
  }
  const unwindPrice = (base.book + premiumOutflow) / base.debentures;
  const irr = base.face != null ? rateZeroCoupon(base.days / 365, base.face, unwindPrice) : null;
  return { premiumOutflow, unwindPrice, irr, cappedIrr: capIrr(irr, base.maxIrr), exitValue: unwindPrice * base.debentures };
}

export type UnwindBase = { book: number | null; debentures: number | null; face: number | null; days: number; maxIrr: number | null; carried: number };

export function productUnwind(product: Product, legs: LegValue[], valuationDate: string): { result: ProductUnwind; base: UnwindBase } {
  const warnings: string[] = [];
  const mob = n(product.mobilisation);
  const face = n(product.faceValue);
  const coupon = n(product.coupon);
  const tenor = n(product.tenorDays);
  if (mob == null || mob <= 0) warnings.push("Mobilization Missing Or Not Positive");
  if (face == null || face <= 0) warnings.push("Face Value Missing Or Not Positive");
  if (coupon == null || coupon <= 0) warnings.push("Coupon Missing Or Zero In Master");
  if (tenor == null || tenor <= 0) warnings.push("Tenor Missing Or Not Positive In Master");
  if (!product.allotmentDate) warnings.push("Allotment Date Missing");
  if (!product.maturityDate) warnings.push("Maturity Date Missing");
  if (product.legs.length && product.legs.every((leg) => leg.prdPremium == null && leg.prdPrice == null)) warnings.push("Premium Missing In Master");
  for (const lv of legs) {
    if (lv.priced.expired && lv.priced.fixing == null) {
      warnings.push(`Missing Fixing For Expiry ${lv.leg.expiry}`);
      break;
    }
  }

  const costs = (n(product.marginPct) ?? 0) + (n(product.ib) ?? 0) + (n(product.tranCost) ?? 0) + (n(product.issuanceCost) ?? 0);
  const daysInvested = product.allotmentDate ? Math.max(0, daysBetween(product.allotmentDate, valuationDate)) : 0;
  const netMobilisation = mob != null ? mob * (1 - costs) : null;
  const grownMobilisation = netMobilisation != null ? grow(netMobilisation, n(product.prodRate) ?? 0, daysInvested) : null;
  const premium = product.legs.reduce((s, leg) => s + legPremium(leg), 0);
  const grownPremium = grow(premium, n(product.premRate) ?? 0, daysInvested);
  const margin = mob != null ? mob * (n(product.marginPct) ?? 0) : null;
  const grownMargin = margin != null ? grow(margin, n(product.marginRate) ?? 0, daysInvested) : null;
  const debentures = mob != null && face != null && face > 0 ? mob / face : null;
  const cap = maxIrr(coupon, tenor);

  const book = grownMobilisation != null && grownMargin != null ? grownMobilisation + grownPremium + grownMargin : null;
  const carried = legs.reduce((s, lv) => s + lv.grownOutflow, 0);
  const realisedOutflow = legs.filter((lv) => lv.priced.expired).reduce((s, lv) => s + lv.outflow + lv.grownOutflow, 0);
  const openOutflow = legs.filter((lv) => !lv.priced.expired).reduce((s, lv) => s + lv.outflow, 0);
  const base: UnwindBase = { book, debentures, face, days: daysInvested, maxIrr: cap, carried };
  const current = atOutflow(base, realisedOutflow + openOutflow);
  if (daysInvested <= 0) warnings.push("Valuation Date Is On Or Before Allotment");

  const residualDays = product.maturityDate ? Math.max(0, daysBetween(valuationDate, product.maturityDate)) : null;
  const expected =
    book != null && residualDays != null && mob != null
      ? expectedDifferenceAtMaturity({
          grownMobilisation: grownMobilisation!,
          grownPremium,
          grownMargin: grownMargin!,
          prodRate: n(product.prodRate) ?? 0,
          premRate: n(product.premRate) ?? 0,
          marginRate: n(product.marginRate) ?? 0,
          residualDays,
          remainingOutflow: -openOutflow,
          contractualTerminal: mob * (1 + (coupon ?? 0)),
        })
      : null;

  return {
    result: {
      daysInvested,
      residualDays,
      netMobilisation,
      grownMobilisation,
      premium,
      grownPremium,
      margin,
      grownMargin,
      debentures,
      maxIrr: cap,
      current,
      realisedOutflow,
      openOutflow,
      expected,
      warnings,
    },
    base,
  };
}

/** Same unwind chain with the option book revalued at another Nifty level. */
export function unwindAtLevel(base: UnwindBase, legOutflowAtLevel: number): UnwindAtLevel {
  return atOutflow(base, legOutflowAtLevel + base.carried);
}
