# 11 — Active Management layer

The Active Management Dashboard is the Unwinding Calculator's Multiple Product Version (docs
01 to 10) with one layer on top. That layer follows the Active Management workbook, which
is an extended Unwind Calculator, wherever the workbook goes further than the Unwinding
Calculator. Every rupee and rate comes out of the same `computeUnwind` and
`priceProductBook` calls the Unwinding screens use; there is no second Black–Scholes, vol
lookup or unwind chain. [12](12-workbook-tally.md) reconciles the app against the workbook
line by line.

Code:
- `lib/active-management/`: pure functions, no React and no fetch.
- `components/active-management/`.
- `components/multi/book-scenario-table.tsx` and `lib/multi/book-filters.ts`.
- `lib/workbook/am-export-columns.ts` and `lib/workbook/book-scenario-export.ts`.
- The `am` block on `POST /api/multi/quotes`.
- `POST /api/multi/scenarios`.

## Definitions

| Figure | Formula | Notes |
|--------|---------|-------|
| Observation dates | The product's unique Option Expiry Dates | The first is the Observation Start Date, the last the Observation End Date |
| Passed | Date on or before the valuation date | Same rule that settles expired options |
| Index close | Close on or before each passed date | The Yahoo closes the unwind settles expired options at; one fetch serves both |
| Average So Far | Σ passed closes ÷ Observations Passed | "-" while a passed close is missing |
| Pending Observations | Upcoming observation months, e.g. "Jul-26, Oct-26" or "Nov-26, Dec-26 & Jan-27" | Workbook Summary C |
| Actual Target | Target Nifty on the New Primary product master; else the highest strike among the originally sold Puts | Baked into `lib/data/am-targets-seed.json` by `npm run bake:am-targets`. Sensex rows carry their Sensex-scale target in the same field |
| Effective Target | (Actual Target × Total − Σ passed closes) ÷ Observations Left | Equals the Actual Target before the first observation; "-" when nothing is left or a passed close is missing |
| Bid Ask spread s | By the leg's expiry: 0.75 volatility points through 31-Mar-2027, 0.5 through 31-Mar-2028, 0.375 through 31-Mar-2029, 0.25 through 31-Mar-2030, then 0.075 | `lib/data/bid-ask-seed.json`. An option originally sold is unwound at surface volatility + s, one originally bought at surface volatility − s, as in the workbook's pricing sheet. Expired legs take none |
| Exit Value | Book unwind value with the side marks, plus simple interest at the premium discount rate on settled option cash from each expiry to the valuation date | Workbook Calculator BH with its AZ term. The Unwinding tabs keep their own Unwind Value, which has no carry term |
| Current Internal Rate of Return | min(rate on Exit Value ÷ debentures over the invested days, Product Internal Rate of Return) at today's spot | Workbook Summary G. "-" when invested days are 0 or the book quote is at or below zero |
| Expected Level | The Nifty or Sensex Spot Level edited on the Unwinding Calculator; today's spot otherwise | There is no separate assumed-level input. An edit re-prices the book's Expected figures after a short pause |
| Expected Internal Rate of Return | Current IRR's formula at the Expected Level | Full re-price, not the workbook's delta shortcut. It equals Current IRR at today's spot |
| Expected Difference | Assets at maturity + settled option cash carried to maturity + open option cash carried to maturity − Face × (1 + Coupon) × Debentures | See below. At the Expected Level |
| Max rate | (1 + Coupon)^(365 ÷ Tenor Days) − 1 | Identical to Product Internal Rate of Return; zero coupon or tenor means no cap |
| Client and Residual Internal Rate of Return | Unwinding's own rates, shown no higher than Product Internal Rate of Return | On the Product Book, the Unwinding Calculator's first tab and both page downloads; a product with no Product IRR (coupon or tenor 0) is shown as it is |

### Expected Difference at maturity

All amounts are carried to the maturity date T. g(r, d) = (1 + r)^(d ÷ 365).

```
Margin now     M = Total Funds For Margin × g(Margin Funding Rate, invested days)
Assets at T      = (NBFC Grown Value − M) × g(Product Discount Rate, residual days)
                 + M × g(Margin Funding Rate, residual days)
                 + Premium Grown Value × g(Premium Discount Rate, residual days)
Settled at T     = Σ expired legs: premium outflow × g(Premium Discount Rate, T − expiry)
Open at T        = Σ live legs: mid premium outflow × e^(q·τ) × g(Premium Discount Rate, T − expiry)
                   q = Forward Sell Rate + 1%, τ = years to the leg's expiry
Expected Difference = Assets at T + Settled at T + Open at T − Face × (1 + Coupon) × Debentures
```

Why each term:
- **Assets.** Each pool grows at its own rate, the way the Unwinding economics grow it to today.
- **Settled cash.** Payouts already made leave the premium pool, so they are carried at the premium rate.
- **Open legs.** These use mid prices: nothing is unwound at maturity, so no spread applies. Each mid is the discounted expected payoff at its expiry, so it is undone with e^(q·τ) and then carried the same way.
- **What the result means.** The assets are sized to grow to the full-coupon redemption, so Expected Difference is, in effect, the option book's cash at maturity. It shows how far the book is expected to fall short of (negative) or exceed the full-coupon payout.

## Home

**Product Book.** Fifteen columns follow the Unwinding columns:
- Current Internal Rate of Return, Expected Internal Rate of Return
- Expected Difference, Exit Value, Mobilization
- Actual Target, Effective Target
- Observations Passed, Observations Left, Pending Observations
- Observation Start Date, Observation End Date, Next Observation Date
- Average So Far, Observation Status

They are one value per product, merged across its leg rows on screen and in both Excel downloads. Expected cells show "…" until they are re-priced at a new Expected Level.

**Totals strip.** Total Mobilization, Total Exit Value and Total Expected Difference for the products shown, each product counted once.

**Tabs.**
- Observation progress tabs: All Products, No Observation Passed, At Least One Observation Passed, with counts.
- They sit under the observation tabs (Ongoing, Observation in 3, 2 and 1 Month) and work with the search and the Reveal window (Start Date and End Date).

**Desk Book.** A Bid Ask Spread tab shows each surface expiry with its spread and the bucket schedule.

**Scenario Table.** It sits below Post Observation Analytics.
- Rows are products. The columns are the 21 index levels from −1,000 to +1,000 points around today's spot, in steps of 100.
- It has the Product Book's own filters, built from the same functions.
- Measure tabs: Unwind Quote Amount, Premium Outflow, Unwind Value, Current Internal Rate of Return and Expected Difference, each with a Change In tab measured against the 0 column.
- Load Scenario Table prices the rows on screen first. Clicking a row opens the product.
- Export View and Export Workbook write one sheet per measure.

## Unwinding Calculator

Three tabs follow the original five, all priced on the exact unwind on screen.

| Tab | Contents | Downloads |
|-----|----------|-----------|
| Active Management | **Targets:** Actual Target and its source, Effective Target. **Observations:** totals, Pending Observations, dates, Average So Far, status. **Rates and values:** Current and Expected Internal Rate of Return, Expected Difference, Exit Value, Current Level, Expected Level. Then warnings and the Observation Schedule | `SP-Active-Management-{code}-{date}` |
| Pricer Table | The 14 pricer columns for this product, then Original Buy or Sell, Unwind Buy or Sell, Unwind Quantity, Unwind Option Price, Premium Outflow Amount, Settlement Fixing. Bid Offer Spread shows each leg's 2s, so a live leg reads Sell < Mid < Buy | `SP-Pricer-Table-{code}-{date}` |
| Scenario Grid | 21 rows from −1,000 to +1,000 points: Index Level, Unwind Quote Amount, Unwind Quote Percent, Premium Outflow, Unwind Value, Current Internal Rate of Return and Expected Difference, each with its change from the centre row | `SP-Scenario-Grid-{code}-{date}` |

- **Separate Pricer page:** there is none now. The Pricer Table is this tab (`/portfolio/unwinding?tab=pricer`).
- **Bid Ask Spread input:** blank uses the Bid Ask table. A number is one flat spread for every leg, and 0 reproduces the Unwinding Calculator's prices.
- **Page downloads:** the page's own Download Excel and Download PDF now add the three tabs after the original content.

## Engine changes against the Unwinding Calculator

These are the only places this repository's engine differs from its twin:

1. **Vol surface memo.** `normalizeVolSurface` keeps one normalised copy per surface object. A whole-book pass went from 72 s to 0.9 s, with identical results across 6,537 hashed checks.
2. **Per-leg Bid Ask.** `bidAskSpread` of `null` means the table. An explicit number behaves exactly as before; every explicit-0 price is byte-identical.
3. **Headline premium cell.** It uses the absolute number of spreads, so a sold leg stored with a negative count is no longer double-negated. This moved 108 live headline quotes, for example NA-866's Client IRR, which had read 79.95%. Golden tests are unchanged.

## Effect of the Bid Ask table

On the live book on 9-Nov-2026, the table made every Premium Outflow move against the desk:
- **Premium Outflow:** median −17.3% of mobilisation, 90th percentile −36.5%.
- **Active Management Current Internal Rate of Return:** median −8.2 points.

These books hold tight put spreads, and both legs move against the desk. This is the workbook's own rule, reproduced on 346 of 346 workbook products. Typing 0 in Bid Ask Spread shows a product without it.

## Checks

- **`npm run verify:am`:**
  - observation counts, targets, Pending Observations text;
  - the Bid Ask buckets and Sell < Mid < Buy;
  - explicit-0 parity, Exit Value and AZ, the book-quote IRRs, Expected Difference;
  - the grid centre and expired cash, a Sensex shift;
  - the scenarios route.
- **`npm run verify:tally`:** the workbook reconciliation on a compact fixture, `scripts/fixtures/workbook-tally.json`.
  - Side volatilities and option marks 3,043 of 3,043.
  - Unwind IRR within 1 basis point on 346 of 346.
  - Actual Target 127 of 127, Effective Target 80 of 81.
  - Expected Difference worked examples 3 of 3.

## Known master-data gaps (not changed here)

- **Targets.** 369 live products are not on the New Primary master and use the top Sell Put strike as Actual Target.
- **Product 715** has a stray 30-Apr-2026 leg: four observations where the workbook has three.
- **Magnifier 319 and 320 Phase II** are missing two observation dates.
- **Product 1624** has a spread count of 92. Gearing Accelerator 40 and Nifty Accelerator 956 still show a headline quote that differs from the book quote.
