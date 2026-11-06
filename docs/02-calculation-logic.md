# Calculation Logic

Last updated 06-Nov-2026 IST. Every formula lives in `lib/engine/` and is covered by `tests/engine/`.

## Global Inputs

| Input | Default |
| --- | --- |
| Valuation Date | Today, Asia/Kolkata |
| Current Nifty | Last completed Yahoo close for `^NSEI`, editable, with a Live button |
| Assumed Nifty | Current Nifty rounded to 100, editable |
| Forward Rate | 5.5% |
| Discount Spread | 1%, so the discount rate is 6.5% |
| Delta Rate | 6.5% |
| Level Revaluation | Delta Approximation, or Full Black Scholes Reprice |

## Observation Lifecycle

For each product's up to seven observation dates (`observations.ts`):

- An observation is done when it is on or before the valuation date and a Nifty close exists for it. A holiday date takes the last close before it, within seven days.
- Average So Far is the mean of the observed closes.
- Done, Total and Pending are counts; Pending Months lists the pending dates as `Jul-26, Oct-26 & Jan-27`.
- Status is Observations Done, Observations Live, Not Started, or No Observations.
- Residual Target = (Actual Target × Total − Average So Far × Done) ÷ Pending. With nothing pending it is blank ("-"); before any observation it equals the Actual Target.

## Leg Pricing

`leg-pricing.ts`, one price per Strike × Expiry × Option × Side:

- Expired legs settle at intrinsic value on the Nifty close of the expiry date.
- Live legs:
  - Vol: the surface vol, interpolated linearly in strike within each expiry row and then linearly in time between rows. Strike columns are moneyness × reference level. The bid ask spread for the expiry is added for an original Sell and subtracted for a Buy.
  - Price: Unwinding Calculator's `blackScholesPrice`, with forward growth at the Forward Rate and discounting at Forward Rate plus Discount Spread.
  - Delta: Unwinding's `blackScholesDelta` with both rates at the Delta Rate. This replaces the external add-in's BSPutDelta and BSCallDelta.
- Market bid and ask interpolate the uploaded NSE chain for the expiry month. The market price for a key is the ask for an original Sell (buy back) and the bid for a Buy. It is shown for comparison on Pricing; valuation uses the model, as the workbook does.

## Unwind Chain

`product-unwind.ts`, matching the Unwinding Calculator and the workbook:

```
Net Mobilisation    = Mobilisation × (1 − Margin Percent − IB − Transaction Cost − Issuance Cost)
t                   = Valuation Date − Allotment Date (days)
Grown Mobilisation  = Net Mobilisation × (1 + Product Rate) ^ (t / 365)
Premium             = Σ leg Product Premium
Grown Premium       = Premium × (1 + Premium Rate) ^ (t / 365)
Margin              = Mobilisation × Margin Percent
Grown Margin        = Margin × (1 + Margin Rate) ^ (t / 365)
Option Outflow      = Σ price × signed quantity
                      + Σ expired payoff × Premium Rate × (Valuation − Expiry) / 365   (simple interest, as the workbook)
Debentures          = Mobilisation ÷ Face Value
Unwind Price        = (Grown Mobilisation + Grown Premium + Grown Margin + Option Outflow) ÷ Debentures
IRR                 = (Unwind Price ÷ Face Value) ^ (365 / t) − 1
Max IRR             = (1 + Coupon) ^ (365 / Tenor Days) − 1
Capped IRR          = min(IRR, Max IRR)
Exit Value          = Unwind Price × Debentures
```

IRR at Assumed Level repeats the chain with every live key revalued at the Assumed Nifty. A missing or zero Coupon or Tenor leaves Max IRR blank, applies no cap and raises a warning.

## Scenario Ladder

Levels run from the Current Nifty rounded to 100, −1,000 to +1,500 in steps of 100: 26 levels. At each level every live key is revalued:

- Delta Approximation, the default, for workbook parity: `max(0, price + (level − current Nifty) × delta)`.
- Full Black Scholes Reprice: the key priced again with Nifty at the level.

Expired legs keep their settled value. Each product's Premium Outflow, Unwind Price and capped IRR are shown per level, with the book exit value per level.

## Expected Difference At Maturity

`expected-difference.ts`, `expectedDifferenceAtMaturity`:

```
residual            = Maturity Date − Valuation Date
GrownMob_T          = Grown Mobilisation × (1 + Product Rate) ^ (residual / 365)
GrownPrem_T         = Grown Premium × (1 + Premium Rate) ^ (residual / 365)
GrownMargin_T       = Grown Margin × (1 + Margin Rate) ^ (residual / 365)
InterestOnlyBook_T  = GrownMob_T + GrownPrem_T + GrownMargin_T
RemainingOutflow_T  = open legs marked at valuation, as money owed, × (1 + Premium Rate) ^ (residual / 365)
ContractualTerminal = Face Value × (1 + Coupon) × Debentures
Expected Difference = InterestOnlyBook_T − ContractualTerminal − RemainingOutflow_T
```

The contractual terminal uses the Unwinding Calculator's maturity redemption convention, Face Value × (1 + Coupon). On the reference book, all 86 products with no open legs and a coupon have InterestOnlyBook_T ÷ Mobilisation equal to 1 + Coupon to four decimals. That holds for 81 of them; the other five are flagged:

- Three products have no coupon in the master, so they read red.
- Nifty Accelerator 716 has no premium in the master, so it reads red with a Premium Missing warning.
- Nifty Accelerator 337 Phase Two and 759 are 2 to 4 percent off, so they read amber.

Expired payoffs already settled are not part of the remaining outflow; the tooltip shows them as Settled Expiry Payoffs To Date. Tones are green within 0.5% of mobilisation, amber up to 5%, and red above.

## Workbook Discrepancies Not Copied

The reference workbook was audited against its cached values (`tests/fixtures/workbook-golden.json`). The desk reproduces the unwind chain for 172 of 176 products. Differences in option marks are below one paisa and come from the normal-distribution approximation in Unwinding's Black–Scholes. Each discrepancy below is a workbook bug the desk does not copy:

| Workbook Behaviour | Desk |
| --- | --- |
| Summary lists ten products twice and sums them twice | Each product once: 176 products |
| Nifty history query stops on 29-Sep-2026, so October observations read as pending | Fixings fetched to today from Yahoo and cached |
| Expiry fixings hard-coded inside the leg formula | Close on the expiry date from the fixing history |
| Expired calls settle at zero | Intrinsic value for calls and puts |
| New Nifty hard-coded at 25,000 | Assumed Nifty input |
| Market prices always read from the May chain | Chain for the leg's own expiry month |
| Strikes outside the surface columns price at zero | Edge vol held flat |
| Pricing key ignores the option type | Key is Strike × Expiry × Option × Side |
| Products 715 and 857 cache a total that disagrees with their leg rows | Sum of the legs |
| Product 716's premium comes from a mis-shaped SUMIF while its master rows are blank | Premium Missing warning |
| Magnifier 426 has two live legs missing from the pricing sheet, priced at zero | Priced on the surface |
| Assumed outflow omits the interest on settled payoffs that the current outflow includes | Included in both |
| Delta from the jrvarma add-in | Black Scholes delta in the engine |
