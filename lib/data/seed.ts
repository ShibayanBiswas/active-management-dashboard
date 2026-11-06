import bookSeed from "@/lib/data/seed/book.json";
import chainsSeed from "@/lib/data/seed/chains.json";
import fixingsSeed from "@/lib/data/seed/fixings.json";
import surfaceSeed from "@/lib/data/seed/surface.json";
import type { AsOf, BidAskPoint, Fixing, OptionChain, Product, VolSurface } from "@/lib/types";

/** Demo book baked from the reference workbook's cached values, so the desk runs without Mongo or the workbook. */
export const SEED = {
  asOf: bookSeed.asOf as AsOf,
  bidAsk: bookSeed.bidAsk as BidAskPoint[],
  products: bookSeed.products as Product[],
  surface: surfaceSeed as VolSurface,
  chains: chainsSeed as OptionChain[],
  fixings: fixingsSeed as Fixing[],
};
