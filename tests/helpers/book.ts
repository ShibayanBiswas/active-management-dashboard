import { SEED } from "@/lib/data/seed";
import golden from "@/tests/fixtures/workbook-golden.json";
import type { DeskInputs } from "@/lib/types";

/** The workbook's own inputs: valuation 29-Oct-2026, Nifty 22,700 and its hard-coded New Nifty of 25,000. */
export const WORKBOOK_INPUTS: DeskInputs = {
  valuationDate: "2026-10-29",
  currentNifty: 22700,
  assumedNifty: 25000,
  forwardRate: 0.055,
  discountSpread: 0.01,
  deltaRate: 0.065,
  scenarioMode: "delta",
};

type GoldenLeg = { premiumOutflow: number | null; grownOutflow: number | null };
type GoldenProduct = { id: string; calculator: Record<string, number | null | string | (number | null)[]>; legs: GoldenLeg[] };
type GoldenKey = { optionType: string; strike: number; expiry: string; side: string; modelPrice: number | null; delta: number | null; baseVol: number | null; vol: number | null };

export const GOLDEN = golden as unknown as { products: GoldenProduct[]; pricing: Record<string, GoldenKey> };

export { SEED };

/**
 * Workbook bugs the desk does not copy: 715 and 857 cache a product total that disagrees with their own leg rows, 716's
 * master rows carry no premium, and 426 has two live legs missing from the pricing sheet, priced there at zero.
 */
export const WORKBOOK_INCONSISTENT = new Set(["nifty-accelerator-715", "nifty-accelerator-857", "nifty-accelerator-716", "nifty-magnifier-426-phase-ii"]);
