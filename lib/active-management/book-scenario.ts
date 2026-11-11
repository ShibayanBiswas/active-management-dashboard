import { scenarioGrid, scenarioLevels } from "@/lib/active-management/scenario";
import { collectExpiredLegExpiryDates } from "@/lib/engine/expiry-spots";
import { issuedCount, productKey } from "@/lib/multi/product-key";
import type { ProductMaster, UnderlyingIndex, UnwindInputs, VolSurface } from "@/lib/types";
import { underlyingFromProductName } from "@/lib/utils";

/** One product at one level of the book scenario table. */
export type BookScenarioCell = {
  shift: number;
  level: number;
  unwindQuoteRs: number | null;
  premiumOutflowRs: number | null;
  /** Unwinding's Unwind Value (masterEconomics). */
  unwindValueRs: number | null;
  /** Active Management Exit Value: Unwind Value plus the AZ carry; the Product Book's exitValueRs at shift 0. */
  exitValueRs: number | null;
  /** min(Book IRR, Max IRR) at this level, on Exit Value ÷ debentures. */
  currentIrr: number | null;
  expectedDifferenceRs: number | null;
};

/** One product's row: 21 cells ordered by shift, from −1,000 to +1,000 around its desk spot. */
export type BookScenarioRow = { underlying: UnderlyingIndex; baseSpot: number; cells: BookScenarioCell[] };

/** −1,000 to +1,000 in steps of 100: the shifts of the 21 scenarioGrid levels. */
export const BOOK_SCENARIO_SHIFTS: number[] = scenarioLevels(0);

/**
 * The Product Book unwind basis, shared by POST /api/multi/quotes and /api/multi/scenarios:
 * the desk date, the issued debentures, the desk spots, and no flat spread, so each leg takes
 * its Bid Ask table spread. Expiry closes are added by the caller.
 */
export function productBookInputs(
  product: ProductMaster,
  basis: { unwindDate: string; nifty: number; sensex: number },
): UnwindInputs {
  const underlying = underlyingFromProductName(product.productName, product.productCode);
  return {
    debentures: issuedCount(product),
    unwindDate: basis.unwindDate,
    spot: underlying === "Sensex" ? basis.sensex : basis.nifty,
    underlying,
    nifty: basis.nifty,
    sensex: basis.sensex,
  };
}

const finite = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

/** The scenarioGrid ladder for one product, cut down to the table's columns. inputs carry the expiry closes. */
function bookScenarioRow(args: { product: ProductMaster; surface: VolSurface; inputs: UnwindInputs }): BookScenarioRow {
  const grid = scenarioGrid(args);
  return {
    underlying: grid.underlying,
    baseSpot: grid.baseSpot,
    cells: grid.cells.map((c) => ({
      shift: c.shift,
      level: c.level,
      unwindQuoteRs: finite(c.unwindQuoteRs),
      premiumOutflowRs: finite(c.premiumOutflowRs),
      unwindValueRs: finite(c.unwindValueRs),
      exitValueRs: finite(c.exitValueRs),
      currentIrr: c.irr.currentIrr,
      expectedDifferenceRs: c.expectedDifferenceRs,
    })),
  };
}

/**
 * POST /api/multi/scenarios body work: every product on the Product Book basis, one expiry-close map
 * per product used at all 21 levels. closes is resolveExpirySpots on the server. A product that
 * fails (a missing close, a bad master) is null and never stops the rest.
 */
export async function bookScenarioRows(args: {
  products: ProductMaster[];
  surface: VolSurface;
  nifty: number;
  sensex: number;
  unwindDate: string;
  closes: (dates: string[], underlying: UnderlyingIndex) => Promise<Record<string, number>>;
}): Promise<Record<string, BookScenarioRow | null>> {
  const rows: Record<string, BookScenarioRow | null> = {};
  for (const product of args.products) {
    const key = productKey(product);
    // A close can be missing on one Yahoo call and present on the next; try the product once more.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const inputs = productBookInputs(product, args);
        const dates = collectExpiredLegExpiryDates(product, args.unwindDate);
        const expirySpots = dates.length ? await args.closes(dates, inputs.underlying as UnderlyingIndex) : {};
        rows[key] = bookScenarioRow({ product, surface: args.surface, inputs: { ...inputs, expirySpots } });
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error("[multi scenarios]", key, err);
          rows[key] = null;
        }
      }
    }
  }
  return rows;
}
