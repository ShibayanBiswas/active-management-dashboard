# 02 — Calculation Logic: Unwind Quote and Whole-Book Economics

This document is the complete map from the reference Calculator / Main Master economics to
the five output tabs on `/portfolio/unwinding`. Option marks come from the Pricer engine in
[03 — Pricer Table](03-pricer-logic.md).

## Output tabs

Tab names never include a unit word. Rupee amounts carry the rupee sign on the **value**,
not in the tab name.

| Tab | What it shows |
|-----|----------------|
| Unwind Quote and Returns | Headline quote, quote amount, three internal rates of return |
| Product Facts | Master costs, Product / Premium Discounting Rates, dates and invested / residual tenor |
| NBFC MIS | Percent book: issued debentures, grown values, outflow percent |
| NBFC Book Values | Rupee book: NBFC amount, NBFC grown value, credited premium, outflow, unwind value |
| Options Book | Strike / side summary plus the 24-leg unwind-marks table |

## Two quote numbers

The desk shows two related but different “unwind quote” figures. They must not be mixed.

| Name | Where it appears | Formula | Engine field |
|------|------------------|---------|--------------|
| Unwind Quote Percent | Quote tab | Same formula as the internal pricer unwind | `unwindQuotePct` |
| Unwind Quote Amount | Quote tab | `FaceValue × QuotePercent` | `unwindQuoteRs` |
| Book Unwind Per Debenture | NBFC Book Values tab | `UnwindValueRs / TotalDebenturesInIssue` | `masterEconomics.unwindQuoteRs` |

The headline percent is the **pricer / calculator** quote used for client IRR. The
whole-book rupee quote divides the rupee unwind value by the total number of debentures in
the mobilization (`mobilization / faceValue`), not by the typed Number of Debentures.

On the Multiple Product home table, **Unwind Quote Amount** is the headline rupee field
`unwindQuoteRs` (`FaceValue × QuotePercent`), shown to two decimals. Excel Main Master
**Unwind Quote** is the book field `UnwindValue / TotalDebentures`. For almost every
product on this book those two engine numbers coincide. They diverge when Required
Quantity does not match the size implied by Spreads (product 1605 is the worked case).

The same Product Book also shows **Premium Outflow** (`masterEconomics.premiumOutflowRs`,
the NBFC Book Values card) immediately after Client Internal Rate of Return. That card is
the sum of every leg's Premium Outflow Amount on the same product. Each leg then shows
Option Expiry Date, Product Premium Per Spread, Product Premium Amount, Unwind Option
Price, and Premium Outflow Amount.

## Option expiry dates

Option Expiry Date on each leg is the observation date. Those dates are taken from
Observation Average 1 through 7 on the Secondary New Primary sheet (the same sheet the
Dynamic Probability Calculator uses). A leg is updated only when the unwind product matches
that sheet on series (Product Code), product name, and rollover phase. A Phase 2 schedule
is applied only when the unwind product name itself says Phase 2. A name with no phase is
the original book and matches a blank or Phase I row. Equal-length schedules replace each
other only when every date moves by at most two months. Nifty Accelerator 706
is the reference: 30-Mar-2026, 30-Jun-2026, and 29-Sep-2026.

## Excel Main Master versus the web app

Single and Multiple Product Masters share the same **28 input columns** and the same
order (`PRODUCT_MASTER_HEADERS`). Unwind Quote is **not** an input column on either
sample — it is recomputed. Blank Required Quantity on the multiple master is ignored
(unused expiry slots) and does not shift later columns.

A desk file `Unwind Diff..xlsx` (no header row) compared Excel Main Master Unwind Quote
(**column B**) to a prior web-app snapshot (**column C**) as of **17-Aug-2026** with Nifty
**24,366**. That date and that typed **live** spot are not the discrepancy:

- Excel Calculator used unwinding date 17-Aug-2026 and spot 24,366.
- Replaying `computeUnwind` at that date with **explicit** spot **24,366** is the engine
  lock. Live Yahoo `index-at-date` for 17-Aug-2026 may later print a revised close; the
  desk lock is the explicit-spot POST, not the live feed.
- Surface Parameters 100% anchors are the last completed closes **on or before 1 Sep 2026**:
  **Reference Nifty Price 24,090.85** and **Reference Sensex Price 77,264.51**. Product 1567
  at 17-Aug / spot 24,366 is **₹1,33,905.27** on the rebuilt 42-leg book (₹1,36,995.07
  before repeated option rows were kept; ₹1,37,035.71 under the prior August 2026 references). Column C (₹137,040.68) was an earlier snapshot when the Nifty
  100% column equalled the 17-Aug live spot 24,366.

Across the legacy For Update subset compared in Unwind Diff the app is typically a few
hundred to about ₹1,100 away from Excel (median absolute gap about ₹670). The engine is
the one that is right. Excel MarketData interpolates volatility on a **frozen
absolute-strike row** captured at a reference Nifty near **25,424.65**
(`38,136.975 / 1.50`) while Black–Scholes still uses the live 24,366 spot. The 100%
MarketData cell on that file was patched to 24,366; the wing columns were not, so the
strike row is internally inconsistent. The desk convention is Deep = ₹500 and every other
column = Strike Change percent × the matching index reference from Surface Parameters
(October 2026 seed: **Reference Nifty Price 22,421.95** and **Reference Sensex Price
71,909.70** at the 100% column; the September 2026 golden surface uses 24,090.85 / 77,264.51). Sensex products interpolate on the Sensex anchors.
Black–Scholes still uses the **live unwind spot**. The app follows that split
(`referenceUnderlyingPrice` / `referenceSensexPrice` + `moneynessStrikes`).

Worked first-leg check, product 1567 Put 31,360 expiry 31-Aug-2028:

| Source | Implied vol | Put price |
|--------|-------------|-----------|
| App, reference-price moneyness (24,090.85) | 13.2483% | 3,593.59 |
| Excel Pricer / frozen-strike interp | 13.589238464762525% | 3,635.027 |
| App Black–Scholes using Excel’s vol | 13.589238464762525% | 3,635.029 |

Black–Scholes matches. The vol lookup does not. Do **not** switch the app onto Excel’s
frozen strikes to chase the Unwind Diff file.

Forward Sell Rate **6.60 percent** on the October and September seeds and on Excel’s 2028+ MATCH is the
same number, not a second bug. The sample / seed stores one month-end point at
7 percent. Native XLSM **Pricing Params** (date in column B, BID in C, Fwd Sell rate in
H) is parsed when that file is uploaded; short-tenor rows may still show 3.85
percent on Excel. That curve does not move this book: measured on 17-Aug-2026 /
Nifty 24,366, swapping the seed’s one 7 percent point for the For Update file’s 15
dated rows (3.85 percent then 7 percent) changes product 1567 Unwind Quote by
**₹0**. None of the For Update live products have a leg that expires before the 7 percent
point. The parser fix does not retune interpolation and does not change seeded
quotes.

Two Excel outliers are also not app mapping errors:

| Product | Excel Unwind Quote | App Unwind Quote Amount | What happened |
|---------|--------------------|-------------------------|---------------|
| 1664 | −1,638,216 | 111,829.64 | Excel includes a broken outflow on blank-quantity slots; the app skips those rows |
| 1605 | 184,834 | 53,812 | Excel book quote versus app headline quote; typed quantity 5,000 is not the spreads-implied book |

Chasing Excel here would mark the wrong moneyness and would pull junk legs back into
the book.

### Collated FY21–FY27 multi book

The Multiple Product seed, merged sample XLSX, and runtime parser book come from
`npm run collate:multi` (`scripts/collate-multi-masters.ts`): eight Main Master XLSM files
under Downloads spanning FY21–FY27 (including Sensex books). Identity is **Product Code**
(desk ISIN / series). Blank, NaN, and zero Required Quantity legs are dropped. When the
same code appears in more than one file, the richer live leg book wins (no double-count).
Products are sorted ascending by trade date. Locked shape: **2,505 products / 79,190 live
legs** in `lib/data/multi-products-seed.json`.

| Check | Result |
|-------|--------|
| Product / leg count | **2,505 / 79,190** (seed JSON ≡ merged sample XLSX) |
| Unique Product Codes | One product per code (`uniqueProductsByIsin`) |
| Blank / NaN / zero qty rows | Dropped |
| Repeated option rows | Kept when price, spread, or quantity differs (`optionLegCloneKey`). An exact clone still drops. **43** products keep a repeated strike. Nifty Accelerator 671 has **192** rows |
| All 8 FY XLSM ISINs ⊆ seed | **0 missing** (`verify:downloads`) |
| Same engine as Single | `computeUnwind` → `priceLeg` / `unwindMarkPrice` — live option marks from the Pricer path |

### Premium Credited on the multi book

**Strategy lock:** initial Premium Credited is always **positive**. It is the absolute value of Σ (Product Price × −Required Quantity) divided by mobilisation. The Excel Premium Credited cell is not an override. A sell quantity is already negative, so the minus sign turns that leg's premium into a receipt. Blank, zero, and "+" or "-" placeholder quantities are not included.

Blank Buy/Sell rows still trust signed Req. Quantity (negative → Sell). ARG26SP17 Series I
matches Excel magnitude for Premium Credited (**₹261,743,567.63**), Product Premium, and
book Unwind Quote.

Live **Unwind Option Price** / premium outflow still come from `priceLeg` on the current
valuation date and spot — not from entry-book Product Price.

## Engine entry points

| File | Function | Role |
|------|----------|------|
| `lib/engine/unwind.ts` | `computeUnwind` | Full result: quote, IRRs, economics, Options Book |
| `lib/engine/unwind.ts` | `rateZeroCoupon` | Implied annual rate growing `pv` to `fv` |
| `lib/engine/unwind.ts` | `mroundLot` | Nearest exchange lot of 75, sign preserving |
| `lib/engine/pricer.ts` | `priceLeg` | Mid / sell / buy marks per leg |
| `lib/engine/pricer.ts` | `unwindMarkPrice` | Side-aware mark |
| `app/api/multi/quotes/route.ts` | `POST /api/multi/quotes` | Batched Product Book marks on the server |

## Time base for the run

```text
invested = max(daysBetween(AllotmentDate, UnwindingDate), 0)
residual = max(TenorDays − invested, 0)
growth   = invested / 365
```

Allotment-day and pre-allotment runs therefore have invested tenor **0**. Grown values stay
at principal and IRRs that would divide by zero return **0**.

The eight FY workbooks use the same period. Grown Value is `FV(product discount, (valuation date − allotment) / 365, −amount with NBFC) + FV(margin funding rate, that same year-fraction, −margin funds)`. Premium Grown Value is `FV(premium discount, that same year-fraction, −premium credited)`. The valuation date is the unwind date on the sheet, not the maturity date. Maturity closes the product tenor. It does not extend these three compounds.

## Headline formulas

`inv` is invested tenor in days. `FV(rate, years, −pv)` is the standard future-value
compound `pv * (1 + rate)^years`.

| Metric | Formula | Engine field |
|--------|---------|--------------|
| Amount with NBFC percent | `1 − (Inbuilt + Transaction + Issuance + Margin)` | `amountWithNbfc` |
| Amount with NBFC rupees | `Mobilization × (1 − sum of costs) − TotalFundsForMargin` | `masterEconomics.amtWithNbfcRs` |
| Grown Value rupees | `FV(PrdDisc, inv/365, −AmtNBFC) + FV(MarginFundingRate, inv/365, −TotalFundsForMargin)` | `grownValueRs` |
| NBFC Grown percent | `GrownValue / Mobilization` | `nbfcGrownValue` |
| Premium fraction | Always **positive**. Absolute value of Σ (Product Price × −Required Quantity) on live legs, divided by Mobilization. Blank, zero, and "+" / "-" quantities are not legs. The Excel Premium Credited cell is not used once a leg has a product price | `premium` |
| Premium Credited rupees | `PremiumFraction × Mobilization` (≥ 0) | `premiumCreditedRs` |
| Premium Grown Value rupees | `FV(PremDisc, inv/365, −PremiumCredited)` | `premGrownValueRs` |
| Premium Grown percent | `PremGrownRs / Mobilization` | `premiumGrownValue` |
| Premium Outflow rupees | Sum of every leg's Premium Outflow Amount. Live legs use the Pricer unwind mark × Unwind Quantity. Expired legs use the in-the-money price × the same Unwind Quantity. Original Sell is cash out. Original Buy is cash in. | `premiumOutflowRs` |
| Unwind Value rupees | `Grown + PremGrown + PremiumOutflow` (live marks + expired intrinsic) | `unwindValueRs` |
| Unwind Quote rupees (book) | `UnwindValue / TotalDebentures` | `masterEconomics.unwindQuoteRs` |
| Current Premium Outflow percent | Sum of signed live leg premiums / ContingentLevel, plus expired in-the-money intrinsic. Sell is negative. Buy is positive. | `currentPremOutflowPct` |
| Residual margin add-on | `MarginCost × max(Tenor − Invested, 0) / Tenor` | part of pricer unwind |
| Pricer Unwind Value | `NBFCGrown% + PremGrown% + PremOutflow% + residual margin` | `pricerUnwindValue` |
| Unwind Quote percent | Equals Pricer Unwind Value | `unwindQuotePct` |
| Unwind Quote amount | `FaceValue × QuotePercent` | `unwindQuoteRs` |
| Product Internal Rate of Return | Rate growing Face to `Face × (1 + ContingentCoupon)` over full tenor days | `productIRR` |
| Client Internal Rate of Return | Rate growing Face to the quote amount over invested days | `clientIRR` |
| Residual Internal Rate of Return | Rate growing the quote amount to the maturity payoff over residual days | `residualIRR` |

The zero-coupon helper is:

```text
rateZeroCoupon(years, pv, fv) = (fv / pv) ^ (1 / years) − 1
```

Guards: if `years <= 0` or `pv = 0` or `fv / pv <= 0`, the helper returns **0**.

`discountingRate` on the result is the **product** discount rate (7.50 percent). It is used
only for NBFC compounding. Option marks use Discount Yield = Forward + 1 percent from
[doc 03](03-pricer-logic.md).

## Tab 1 — Unwind Quote and Returns

| Card label | Field |
|------------|-------|
| Unwind Quote Percent | `unwindQuotePct` |
| Unwind Quote Amount | `unwindQuoteRs` |
| Product Internal Rate of Return | `productIRR` |
| Client Internal Rate of Return | `clientIRR` |
| Residual Internal Rate of Return | `residualIRR` |

Pricer Unwind Value is the same number as Unwind Quote Percent and is **not** shown as a
separate card.

## Tab 2 — Product Facts

| Card label | Field |
|------------|-------|
| Face Value | `faceValue` |
| Initial Underlying Level | `initialNiftyLevel` (Nifty or Sensex strike base) |
| Contingent Coupon | `contingentCoupon` |
| Inbuilt | `inbuilt` |
| Transaction Cost | `tranCost` |
| Issuance Cost | `issuanceCost` |
| Margin Cost | `marginCost` |
| Product Discounting Rate | `discountingRate` (product 7.50%) |
| Premium Discounting Rate | `premiumRate` (5.10%) |
| Delta Date | `deltaDate` |
| Allotment Date | `allotmentDate` |
| Maturity Date | `maturityDate` |
| Tenor | `tenorDays` |
| Invested Tenor | `investedTenorDays` |
| Residual Tenor | `residualTenor` |

Contingent Level is **not** a Product Facts card. On this book it equals Initial Underlying
Level, so the duplicate card is omitted. The engine still falls back Contingent → Initial
when the master value is blank. Screen, Excel, and PDF all call `unwindProductFactRows`
so Initial Underlying Level is `result.initialNiftyLevel`, not a second lookup.

## Tab 3 — NBFC MIS

| Card label | Field |
|------------|-------|
| Total Debentures in Issue | `totalDebs` = mobilization / face — not the typed holding |
| Amount with NBFC Percent | `amountWithNbfc` |
| NBFC Grown Value Percent | `nbfcGrownValue` |
| Premium Credited Percent | `premium` (fraction of mobilization) |
| Premium Grown Value Percent | `premiumGrownValue` |
| Current Premium Outflow Percent | `currentPremOutflowPct` |

## Tab 4 — NBFC Book Values

| Card label | Field |
|------------|-------|
| Amount with NBFC Rupees | `amtWithNbfcRs` |
| NBFC Grown Value Rupees | `grownValueRs` |
| Premium Credited | `premiumCreditedRs` |
| Premium Grown Value Rupees | `premGrownValueRs` |
| Premium Outflow | `premiumOutflowRs` (sum of the Options Book Premium Outflow Amount column) |
| Unwind Value | `unwindValueRs` |
| Book Unwind Per Debenture | `unwindValueRs / totalDebs` |

## Tab 5 — Options Book

Summary cards:

| Card label | Meaning |
|------------|---------|
| Buy Legs Unwind Sell | Count of original Buy legs |
| Sell Legs Unwind Buy | Count of original Sell legs |
| Unique Strikes | Distinct strike prices (6 on the default product) |

### Options Book columns

Order on the on-screen Options Book table, Excel, and PDF (**11 columns** — Quantity
Rounded is not shown):

1. Option Type
2. Strike Price
3. Number of Spreads
4. Original Buy or Sell
5. Unwind Buy or Sell
6. Unwind Quantity
7. Option Expiry Date
8. Product Premium Per Spread
9. Product Premium Amount
10. Unwind Option Price
11. Premium Outflow Amount

Current Option Price is not shown — it duplicated the unsigned unwind mark. Product
Premium Per Spread is the Product Master Product Price, unsigned. Unwind Option Price is
the live `priceLeg` mark without a minus. On an expired leg that price is the
in-the-money amount, the same number for Unwind Buy and Unwind Sell. Premium Outflow
Amount is that price times Unwind Quantity, and the product Premium Outflow is the sum
of those amounts. Lot rounding is computed and is not a column, and it does not change
the cash. SD Codes stay in the engine (`leg.sdCode`)
and are not shown on the Options Book, the Pricer Table, Excel or PDF.

### Quantity versus Required Quantity

These are **not** the same number.

**Unwind Quantity** (column 6) is Required Quantity scaled to the typed holding, so every
expiry in a strike group shows the **same** quantity as the Product Master input book:

```text
Unwind Quantity = Required Quantity × (Number of Debentures / Total Debentures in Issue)
```

At 800 holding and 1,913 issued, the 23,408 sell legs are all −36,931.82 — matching the
master Required Quantity of −88,313.21 scaled by 800 / 1,913. Options Book **Premium
Outflow Amount** is the option price times that same Unwind Quantity. A live price is the
Pricer unwind mark. An expired price is the in-the-money amount, and it does not change
when the unwind action is Buy or Sell: a put is max(strike − spot, 0), a call is
max(spot − strike, 0). Original Sell pays it (negative). Original Buy receives it
(positive). The product Premium Outflow card is the sum of those leg amounts, and that
sum enters Unwind Value. **Product Premium Amount** stays on unscaled Required Quantity
for Main Master parity.

Lot Round Off rounds Unwind Quantity to the nearest exchange lot of **75** (sign preserving):
`round(qty / 75) * 75`.

**Required Quantity** (`leg.reqQuantity`) is the uploaded / seeded master column. The
sample workbook formula is:

```text
Required Quantity = IF(Side = "Sell", −1, 1)
                    × Spreads × Mobilization / InitialNifty / 4
```

Product Premium Amount stays on Required Quantity (Main Master). Premium Outflow Amount
**on the Options Book** is the live Pricer unwind mark, or the expired in-the-money price,
times the Unwind Quantity on that row. Net Premium Outflow is the sum of those amounts.
It is not a second pass over unscaled Required Quantity, and expired cash is not lot-rounded
away from the quantity the row shows. **Pricer Table** still stores **0** after expiry
(Excel IFERROR). Out-of-the-money expired options stay 0.

### Unwind Side

Original Buy → Unwind Sell. Original Sell → Unwind Buy.

On the golden book: 16 unwind-sell legs (original buy) and 8 unwind-buy legs (original
sell).

### Premium per Spread (display)

This is the **Product Price** column from the Product Master (`leg.prdPrice`), not a
Black–Scholes split. The cell is unsigned.

```text
Premium per Spread = |leg.prdPrice ?? product.prdPrice|
```

Marks below `0.005` display as blank (`—`). The Calculator sheet's signed split
`± (CurrentPrice × Spreads) / COUNTIFS` still feeds Current Premium Outflow percent on the
headline quote. It is not shown on the Options Book.

### Product Premium

```text
ProductPremium = (leg.prdPrice ?? product.prdPrice) × (−RequiredQuantity)
```

Product Price is **per leg**. The first leg is 3,215.70; later expiries carry their own
marks. This is not a single product-level number.

### Unwind Price and Premium Outflow

```text
Live legs (Excel + desk, same path):
Pricer Price / Sell / Buy are ROUND(BS, 2) — Excel currency cells / paisa.
UnwindPrice           = unwindMarkPrice(pricerRow, originalSide)   // already 2 decimals
PremiumOutflowAmount  = ROUND(that mark × Unwind Quantity, 2)

Expired option — same price for Unwind Buy and Unwind Sell (Pricer stays 0):
Put in the money  = ROUND(max(strike − spot_at_leg_expiry, 0), 2)
Call in the money = ROUND(max(spot_at_leg_expiry − strike, 0), 2)
spot_at_leg_expiry = Yahoo Finance close on the India calendar date of that expiry,
or the previous session if that date did not trade. Today's index is not a substitute.
The price itself is never negative. The cash sign follows the original side.
Original Sell pays (negative). Original Buy receives (positive).
OTM expired options are 0. Same strike on two expiries can differ when the index moved.
PremiumOutflowAmount  = ROUND(in-the-money price × Unwind Quantity, 2)

Net Premium Outflow on the product card, Unwind Value, and the book quote:
NetPremiumOutflow     = ROUND(sum of every leg's PremiumOutflowAmount, 2)
```

Excel’s Pricer lookup errors after expiry and stores **0** on Price/Sell/Buy — the desk
**Pricer table matches that** and is not changed. On the Options Book and NBFC Premium
Outflow, an expired option uses its intrinsic. A sold option that finishes in the money
is cash going out. A bought option that finishes in the money is cash coming in. The
product Premium Outflow equals the sum of those leg amounts, including the live marks.
That counted cash is shown **prominent** (bold maroon). Expired out-of-the-money options
stay faint zeros.

A put option price is never negative. At expiry the put payoff is max(strike − spot, 0).
OTM expired puts and calls show **0** on the Options Book (not a negative spot − strike).

Option marks and premium outflows are **two decimal places end-to-end** (`roundDeskMoney`),
matching Excel currency rounding. A raw Black–Scholes value of 0.000004 becomes **0.00**,
so the Options Book never shows price 0.00 with a non-zero paise outflow.

### Negative headline quotes

A negative Unwind Quote Percent can appear when option marks (live and/or expired
in-the-money intrinsic) make Current Premium Outflow so large that it outweighs NBFC Grown +
Premium Grown. On the 2026-09-10 ongoing audit, the five negative quotes all had
**0 expired legs** — live economics only on that run.

Every one of the 24 legs is marked dynamically. Deep out-of-the-money strikes are **not**
left at zero. Discounting uses the pricer convention in [doc 03](03-pricer-logic.md)
(forward plus one percent).

### SD Codes

Same key as Option Code: `P` + serial day + rounded strike. Example `P4644323408`.
Computed on every leg and used by the pricer. **Not displayed** on the Options Book UI.

## Bid Ask Spread

Default **0 percent**. Sell Price uses `σ − z/2`, Buy Price uses `σ + z/2`. Current Option
Price is the unsigned mid. Unwind Option Price is the bid or offer side, shown unsigned.
Premium Outflow Amount keeps the cash-flow sign.

## Default product constants

Nifty Accelerator - 961, as seeded and as uploaded in the sample Product Master.

| Field | Value |
|-------|-------|
| Product Code | ARG24SP06 Series I |
| Mobilization | 23,91,25,000 |
| Face Value | 1,25,000 |
| Total debentures in book | 1,913 |
| Initial Underlying Level | 17,600 |
| Contingent Coupon | 100.00% |
| Inbuilt | 8.8525236701445% |
| Transaction Cost | 0.25% |
| Issuance Cost | 0.13% |
| Margin Cost | 0.00% |
| Product Discount Rate | 7.50% |
| Premium Discount Rate | 5.10% |
| Margin Funding Rate | 7.10% |
| Total Funds For Margin | 6,31,08,198.13 |
| Premium Fraction | 53.53413402415197% |
| Tenor | 1,875 days |
| Allotment Date | 13-Apr-2023 |
| Maturity Date | 31-May-2028 |
| Trade / Delta Date | 03-Apr-2023 |
| Option Legs | 24 puts, 6 strikes |

## Worked golden sample — 21-Feb-2025, spot 22,800, 800 debentures

Invested tenor = 21-Feb-2025 minus 13-Apr-2023 = **680** days. `growth = 680 / 365`.

```text
costSum          = 8.8525236701445% + 0.25% + 0.13% + 0% = 9.2325236701445%
Amount with NBFC = 1 − 9.2325236701445% = 90.7674763298555%
Amt NBFC Rs      = 23,91,25,000 × 90.7674763298555% − 6,31,08,198.13
                 = 15,39,39,529.65
Premium Credited = 53.53413402415197% × 23,91,25,000 = 12,80,13,497.99
```

These rupee identities are surface-invariant. They match the Calculator and Main Master
sheets of `Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) - Sample.xlsm` to the paisa.

| Metric | Engine | XLSM Main Master / Calculator |
|--------|--------|-------------------------------|
| Amount with NBFC | 90.7674763298555% | Same |
| NBFC Grown | 103.65012581321735% | Same |
| Premium | 53.53413402415197% | Same |
| Premium Grown | 58.73229043604778% | Same |
| Invested tenor | 680 days | Same |
| Premium Credited | 12,80,13,497.99 | Same to the paisa |
| Amount with NBFC rupees | 15,39,39,529.65 | Same |
| Grown Value | 24,78,53,363.35 | Same |
| Premium Grown Value | 14,04,43,589.51 | Same |
| Product Premium, leg 0 | 28,39,88,423.19 | Same |
| Product Premium, leg 5 | −24,01,32,552.91 | Same |
| Product Premium, leg 23 | −12,66,380.68 | Same |
| Product Internal Rate of Return | 14.44597% | Same |

Option marks depend on the Volatility Surface.

| Surface | First-leg price `P4644323408` | Headline quote |
|---------|-------------------------------:|----------------|
| XLSM MarketData (Apr'24–Mar'25) | 944.33 | Workbook **142.96%**. Engine **143.17%** because all 24 legs are marked |
| September 2026 golden surface (`vol-surface-golden-sep-2026.json`) | 684.61 | **147.18%** |
| October 2026 live seed | 523.39 | **148.84%** |

The XLSM Pricer prices only **10 of 24 legs** and leaves fourteen deep out-of-the-money
legs at a zero unwind price. This engine marks every leg. On that file’s own MarketData
grid the ten commonly priced legs match to a few paise (`npm run verify:xlsm`). The extra
0.21 percentage points are the fourteen OTM marks. The 684.61 lock uses the September
seed file as stored. An open desk carries that grid under the current month and replaces
the 100% anchors with that month's Yahoo close. The stored golden quote is **147.178 percent**.

Calculator sheet quantity still divides some quarterly legs by 3. The Options Book shows
Required Quantity scaled by typed holding / issued, so every expiry in a strike group
shares one quantity.

```bash
npm run verify:parity    # September-surface unwind assertions
npm run verify:pricer    # September-surface pricer rows
npm run verify:xlsm      # XLSM MarketData replay of Calculator / Master / Pricer
```

## Edge cases

| Case | Behaviour |
|------|-----------|
| Expired option | Price 0. Outflow 0 × quantity is added into the unwind value |
| Unwind on or before allotment | Invested tenor clamped to 0; IRRs and grown values stay finite |
| Non-positive debentures or spot | API returns HTTP 400 |
| Invalid unwinding date | API returns HTTP 400 |
| Negative Bid Ask Spread | Floored at 0 |
| Zero Contingent Level or tenor | Guards prevent `NaN` (blank Contingent falls back to Initial Underlying Level, then 1; tenor floor 1 for margin residual) |

Covered by `npm run verify:edge`.

## HTTP contract

This app does not ship the Unwinding Calculator's single-product `POST /api/unwind`. The
Unwinding Calculator page runs `computeUnwind` in the browser on the selected product.
Product Book marks come from `POST /api/multi/quotes` with `{ "keys": [productKey, …] }`
(at most 64), which runs `computeUnwindWithExpirySpots` on the server with today's desk
Nifty and Sensex, the issued debentures, and a zero Bid Ask Spread, and returns
`{ quotes, unwindDate, nifty, sensex, spotSource, priceAsOfDate, priced }`.

## UI notes

- Default Unwinding Date is **today**. Spot fields stay **—** until Yahoo (or a typed
  level) arrives; the quote does not compute on an empty index. Change the date to
  21-Feb-2025 to reproduce the golden sample. Default Underlying is **Nifty** unless the
  product name or code matches Sensex / S&P BSE / BSE Sensex. On today plus live Yahoo Nifty (about 24,000–25,000
  on the September 2026 surface) the Unwind Quote Amount and Book Unwind Per Debenture sit
  near **₹ 2.05 lakh**. The 21-Feb-2025 / 22,800 golden is a different date and spot
  (~₹ 1.84 lakh). A 112% headline at ₹ 1.40 lakh on today is the book with Premium
  Credited fallen back to Inbuilt + costs (~9%) instead of the 53.53% option-book
  premium. That path is removed.
- Input Parameters matches Primary SP Product Details: one full-width row per field, gold
  uppercase label on the left and the control filling the right. Spot fields use a rupee
  suffix; Bid Ask Spread uses a percent suffix. Number of Debentures is the **last** input
  field, with Primary SP preset chips. It is the typed holding; Total Debentures in Issue
  is mobilization / face and is date-invariant.
- Output cards use `SpecRail` (one horizontal row, Title Case labels, visible H-scroll
  when cards overflow). Reveal control: **Click Here To View Unwinding Output**.
- Download Excel and Download PDF sit in the bottom-right of the revealed output.
  Excel covers the on-screen tabs. The PDF below the output is quote, facts, funding
  and whole-book pages only — Options Book has its own **Download Options Book PDF**.
  Both files use Primary SP desk chrome (logo, gold/maroon masthead, bordered tables,
  disclaimer).
- Every Options Book, Pricer and Product Master table still has one data row per leg.
  Consecutive identical values in a column merge into one cell (`computeRowSpans`). Premium
  tables use the Primary SP chrome: cream/gold header, maroon Title Case labels, gold
  underline (`.data-table-premium`).
- The Desk Book Product Master is the **input** book (28 columns). It does not
  show SD Codes. Those stay engine-derived and are hidden on the Pricer Table and the
  Options Book.
