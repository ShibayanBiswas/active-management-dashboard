import { pricingSpotFromDesk, resolveDeskSpots, type DeskSpots } from "@/lib/engine/desk-spots";
import {
  collectExpiredLegExpiryDates,
  resolveExpirySpots,
} from "@/lib/engine/expiry-spots";
import { computeUnwind } from "@/lib/engine/unwind";
import type { ProductMaster, UnwindInputs, UnwindResult, VolSurface } from "@/lib/types";
import { underlyingFromProductName } from "@/lib/utils";

export type UnwindWithSpotsResult = UnwindResult & {
  /** Yahoo desk levels used for this valuation (when yahooDeskSpots was on). */
  deskSpots?: DeskSpots;
  /** Per-expiry Yahoo closes used to settle every expired put and call. */
  expirySpotsUsed?: Record<string, number>;
};

/**
 * Full dynamic unwind:
 * 1. Desk Nifty / Sensex / pricing spot from Yahoo for the unwinding date (default).
 * 2. Expired-leg settlement spots from Yahoo on/before each Option Expiry Date.
 * 3. computeUnwind with those levels — no hardcoded index prints.
 */
export async function computeUnwindWithExpirySpots(args: {
  product: ProductMaster;
  surface: VolSurface;
  inputs: UnwindInputs;
  /**
   * When true (default), overwrite spot / nifty / sensex from Yahoo for unwindDate.
   * Set false only for locked golden Excel fixtures that pin a historical spot.
   */
  yahooDeskSpots?: boolean;
}): Promise<UnwindWithSpotsResult> {
  const { product, surface, inputs } = args;
  const yahooDeskSpots = args.yahooDeskSpots !== false;
  const underlying =
    inputs.underlying === "Sensex" || inputs.underlying === "Nifty"
      ? inputs.underlying
      : underlyingFromProductName(product.productName, product.productCode);

  let deskSpots: DeskSpots | undefined;
  let nextInputs: UnwindInputs = { ...inputs, underlying };

  if (yahooDeskSpots) {
    deskSpots = await resolveDeskSpots(inputs.unwindDate);
    const spot = pricingSpotFromDesk(underlying, deskSpots);
    nextInputs = {
      ...nextInputs,
      spot,
      nifty: deskSpots.nifty,
      sensex: deskSpots.sensex,
    };
  }

  const expiryDates = collectExpiredLegExpiryDates(product, nextInputs.unwindDate);
  const expirySpots =
    nextInputs.expirySpots ??
    (expiryDates.length > 0 ? await resolveExpirySpots(expiryDates, underlying) : {});

  for (const iso of expiryDates) {
    if (!(expirySpots[iso] != null && expirySpots[iso]! > 0)) {
      throw new Error(
        `Yahoo expiry spot missing for ${iso} (${underlying}) — cannot settle an expired option`,
      );
    }
  }

  const result = computeUnwind({
    product,
    surface,
    inputs: { ...nextInputs, expirySpots },
  });

  return {
    ...result,
    deskSpots,
    expirySpotsUsed: expirySpots,
  };
}
