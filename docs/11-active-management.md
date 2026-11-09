# 11 — Active Management layer

The Active Management Dashboard is the Unwinding Calculator's Multiple Product Version (docs
01 to 10) with one layer added on top. Every figure in this layer comes out of the same
`computeUnwind` and `priceProductBook` calls the Unwinding screens use; there is no second
Black–Scholes, vol lookup or unwind chain. Nothing Unwinding already shows has changed.

Code: `lib/active-management/` (pure functions, no React, no fetch),
`components/active-management/`, `components/multi/assumed-level-inputs.tsx`,
`lib/workbook/am-export-columns.ts`, and the `am` field on `POST /api/multi/quotes`.

## Definitions

| Figure | Formula | Notes |
|--------|---------|-------|
| Observation dates | The product's unique Option Expiry Dates | `productObservationYmds`. First date is the Observation Start Date, last is the Observation End Date |
| Passed | Date on or before the valuation date | Same rule that settles expired options, so an expiry on the valuation date counts as passed |
| Index close | Close on or before each passed date | The same Yahoo closes the unwind settles expired options at (`expirySpotsUsed`); one fetch serves both |
| Average So Far | Σ passed closes ÷ Observations Passed | "-" while any passed close is missing |
| Actual Target | Target Nifty on the New Primary product master; else the highest strike among the originally sold Puts | Baked into `lib/data/am-targets-seed.json` by `npm run bake:am-targets`; Sensex rows carry their Sensex-scale target in the same field |
| Effective Target | (Actual Target × Total − Σ passed closes) ÷ Observations Left | Equals the Actual Target before the first observation. "-" when nothing is left, there are no observations, or a passed close is missing |
| Max rate | (1 + Coupon)^(365 ÷ Tenor Days) − 1 | Identical to Product Internal Rate of Return, so it has no column of its own. A zero coupon or tenor means no cap |
| Current Internal Rate of Return | min(Client Internal Rate of Return, Product Internal Rate of Return) | "-" when invested tenor is 0 or the quote is at or below zero |
| Expected Internal Rate of Return at Assumed Level | min(Client Internal Rate of Return of a full unwind at the assumed level, Product Internal Rate of Return) | Same date, debentures, spread, surface and settled closes; only the option spot moves. A blank assumed level uses the desk spot, and then Expected equals Current |
| Scenario Grid | 21 full unwinds at S0 + k × 100 for k = −10 … +10 | S0 is the unrounded desk spot. The k = 0 row is the on-screen result. Changes are each level less k = 0, rupees to the paisa |

Unlike the reference workbook, Expected Internal Rate of Return reprices the book instead of
using a delta shortcut, and it reads the assumed level the desk typed rather than a fixed
25,000. Expired options keep their settled closes at every level.

## Home — Product Book

- **Eleven columns** after Premium Outflow Amount: Current Internal Rate of Return, Expected
  Internal Rate of Return at Assumed Level, Actual Target, Effective Target, Observations
  Passed, Observations Left, Observation Start Date, Observation End Date, Next Observation
  Date, Average So Far, Observation Status. One value per product, merged across its leg rows,
  in both Excel downloads as numbers and dates.
- **Observation progress tabs** under the observation tabs: All Products, No Observation
  Passed, At Least One Observation Passed, each with a count. They filter inside the active
  observation tab, search and revealed date window, and Export View follows them.
- **Assumed Nifty Level and Assumed Sensex Level** with Apply and Reset To Desk Level.
  Placeholders show the desk levels. Apply re-prices the whole book (two unwinds per product);
  until a product is re-priced its Expected cell shows "…" and the downloads wait.
- Status values: No Observations, Not Started, Observations Live, Observations Done.

## Unwinding Calculator — three extra tabs

All three use the page's own inputs and the exact unwind already on screen.

| Tab | Contents | Downloads |
|-----|----------|-----------|
| Active Management | Targets (Actual Target, source, Effective Target), Observations, the rates including Expected at the assumed level, warnings, and the Observation Schedule (date, Passed or Upcoming, Index Close, Provisional) | `SP-Active-Management-{code}-{date}.xlsx` / `.pdf` |
| Black Scholes Pricer | The Pricer Table's 14 columns for this product, then Original Buy or Sell, Unwind Buy or Sell, Unwind Quantity, Unwind Option Price, Premium Outflow Amount, Settlement Fixing | `SP-Black-Scholes-Pricer-{code}-{date}.xlsx` / `.pdf` |
| Scenario Grid | 21 rows from −1,000 to +1,000 points: Index Level, Unwind Quote Amount, Unwind Quote Percent, Premium Outflow, Unwind Value, Client, Current and Residual rates, each with its change from the centre row | `SP-Scenario-Grid-{code}-{date}.xlsx` / `.pdf` |

The grid is priced when its tab opens, one level at a time so the page stays responsive, and
is remembered for that unwind. A product whose options have all expired has a flat grid.
The page's own Download Excel and Download PDF are unchanged and do not include these tabs.

## Speed

`normalizeVolSurface` keeps one normalised copy per surface object (a `WeakMap`). This is the
one engine edit in this repository and is not in the Unwinding Calculator. It cut a whole-book
pass from 72 s to 0.9 s on a loaded machine, with no change in any of 6,537 hashed results
(2,179 unwinds, 2,179 unwinds at +500, 2,179 pricer tables). Surfaces must therefore be
treated as read-only once normalised; every caller already copies before editing.

## Checks

`npm run verify:am` (offline, in `npm run verify` and CI) covers:

- observation counts against Unwinding's own helpers on every live product;
- Effective Target against workbook Calculator rows;
- Max rate equal to Product Internal Rate of Return;
- grid centre equal to the unwind, expired cash fixed across levels, a Sensex shift, and a
  missing closes map throwing;
- pricer rows aligned with the Options Book;
- the target seed (715 → 24,920 and 740 → 22,211 from the product master, and 150 of 150 workbook
  targets);
- Expected equal to Current at the desk spot on every live product.

## Known master-data gaps (not changed here)

- 369 live products are not on the New Primary master (DMF series, newer series, some Sensex
  series) and use the top Sell Put strike as Actual Target.
- Product 715 has a stray 30-Apr-2026 leg, so it shows four observations where the workbook
  has three.
- Magnifier 319 and 320 Phase II are missing two observation dates in the master.
