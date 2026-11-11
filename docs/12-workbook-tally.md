# 12 — Workbook tally

This is a reconciliation of the app against the Active Management reference workbook
(`Mar26 Unwind Calculator Auto Surface_Oct _3110.xlsx`). The run was made on 11-Nov-2026 at the
workbook's own inputs:
- valuation 29-Oct-2026, Nifty 22,700;
- its Surface sheet and anchor 22,716.2, forward 5.5% and discount 6.5%;
- its index closes;
- its per-expiry Bid Ask spreads.

`npm run verify:tally` replays the parts that need no workbook file, from
`scripts/fixtures/workbook-tally.json`.

## How closely the engine reproduces the workbook

| Check | Result |
|---|---|
| Surface volatility (linear in strike, then in time) | 3,239 of 3,239 legs to 1e-12 |
| Side volatility (surface ∓ Bid Ask spread) | 3,043 of 3,043 to 1e-12 |
| Option unwind price against the workbook's per-leg price | 3,043 of 3,043 within ₹0.01 |
| Expired-leg intrinsic | 5,193 of 5,193 within ₹0.01 |
| Unwind IRR, with carry on settled cash and the Bid Ask spread | 346 of 346 within 1 basis point |
| Max IRR | 173 of 173 |
| Current IRR cap, MIN(IRR, Max IRR) | 176 of 176 |
| Actual Target | 127 of 127 |
| Effective Target | 80 of 81 under the workbook's own fixing rule; the miss is 715's stray leg |
| Observations Total | 126 of 127 |

All 24 products where Observations Passed differs from the workbook have a 27-Oct-2026
observation. The workbook's close history stops on 29-Sep-2026, so it still counts those dates
as pending. The app is right on these.

## What the app takes from the workbook

| Workbook | App |
|---|---|
| Summary D, Actual Target | Product Book and Active Management tab |
| Summary E, Residual Target | Effective Target |
| Summary F, Max IRR | Product Internal Rate of Return |
| Summary G, Current IRR | Current Internal Rate of Return, on the book quote |
| Summary H, IRR at assumed level | Expected Internal Rate of Return at the Expected Level (a full re-price) |
| Summary C, pending observations | Pending Observations |
| Summary I, J and K, and the I1/J1/K1 totals | Mobilization and Exit Value columns, and the totals strip |
| Calculator AN, AO, AP, AQ, AT | Average So Far, Observations Passed, Total, Status, Left |
| Calculator AZ, carry on settled option cash | Inside Exit Value and the Active Management IRRs |
| Calculator BL–DJ ladder | Scenario Grid, plus the book-wide Scenario Table |
| Pricing sheet volatility ± Bid Ask | Pricer Table Sell and Buy prices, and the unwind marks |
| Bid Ask A:B | Desk Book → Bid Ask Spread, `lib/data/bid-ask-seed.json` |

## Workbook errors the app does not copy

- **The assumed level was never wired.** The workbook types 24,100 as its assumed level but uses 25,000 everywhere. The app's Expected Level is the Spot Level the desk edits.
- **The delta shortcut drops convexity and realised payouts.** The app re-prices fully at every level.
- **Some fixings are missing.** The close history stops on 29-Sep-2026 and is matched to the exact date. The app takes the close on or before each date.
- **Exit Value covers only rows 3–79, and duplicate rows are double counted.** The app covers every product once.
- **468 legs are priced at zero volatility.** Their expiry is missing from the Bid Ask table, or their strike is below 55%. The app interpolates, holding the surface flat at its edges.
- **The pending-months text breaks on 70 rows.**

## Where the app and the workbook still differ

- **Master data:** 140 of 288 seed products carry different leg expiries, leg counts or facts from the workbook's own legs. For example, the seed uses observation dates as leg expiries, and its duplicate leg blocks are halved.
- **The default surface:** the desk anchors on the close on or before the 1st of the month (November 2026: 23,053.10), with a 6.60% forward.
- **Not built:** the workbook's per-leg ladder prices, and ladder levels +1,100 to +1,400.
