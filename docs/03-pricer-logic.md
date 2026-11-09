# 03 — Calculation Logic: Pricer Table

This document is the complete map from the reference Pricer sheet to the live table on
`/portfolio/pricer`. Every column, formula, convention, type field, API field and golden
check lives here. The unwind marks on the Options Book reuse the same engine — see
[02 — Unwind Quote and Whole-Book Economics](02-calculation-logic.md).

## What the Pricer Table is

The Pricer Table is the mark-to-model book for every option leg on the active product. It
does **not** read cached prices from a workbook. For the selected **Unwinding Date** and
**Underlying Spot** (Nifty or Sensex) it:

1. Looks up implied volatility on the monthly Volatility Surface.
2. Grows the spot at the Forward Sell Rate to the option maturity.
3. Discounts at the pricer convention (Forward Sell Rate plus one percent).
4. Prices the option with Black–Scholes on that forward.
5. Shifts volatility by half the Bid Ask Spread to produce Sell Price and Buy Price.
6. Reports a finite-difference Delta.

The default product, Nifty Accelerator - 961, has **24 put legs**. The table therefore has
24 rows. Consecutive identical values in a column (Underlying Spot, Unwinding Date, Option
Type, Volatility Bump, Bid Offer Spread) merge into one cell. Distinct marks stay on their
own row.

The Pricer Table is a **per-leg mark**. It does not use Number of Debentures, Required
Quantity, quantity divisors, or the Product Discount Rate. The pricing spot is the chosen
Underlying — Nifty or Sensex.

**Options Book / unwind pipeline:** `computeUnwind` calls the same `priceLeg` for every
live leg, then `unwindMarkPrice` (Sell → Sell Price, Buy → Buy Price). That mark is the
Options Book Unwind Option Price and the premium-outflow input. Entry-book Product Price
is only for Product Premium / credited-premium display — never the live mark.

## User-facing columns

Full forms only. This is the exact header order rendered on screen and in the Excel / PDF
exports (`PRICER_HEADERS` in `lib/workbook/export-screen.ts`).

| Order | Column | Meaning | Source |
|------:|--------|---------|--------|
| 1 | Strike Price | Absolute strike of the leg | Product Master |
| 2 | Option Expiry Date | Option expiry | Product Master |
| 3 | Unwinding Date | Valuation date chosen in the input panel | User input, default today |
| 4 | Option Type | Put or Call | Product Master |
| 5 | Underlying Spot Level | Spot of the chosen Nifty or Sensex | Yahoo Finance or typed |
| 6 | Forward Growth Rate | Monthly Forward Sell Rate at this maturity | Surface parameters |
| 7 | Discount Yield | Forward Growth Rate plus one percent | Pricer convention |
| 8 | Implied Volatility | Interpolated surface vol as a decimal, plus Volatility Bump | Surface grid |
| 9 | Volatility Bump | Monthly bump from sheet two of the surface file | Surface parameters |
| 10 | Bid Offer Spread | Bid Ask Spread `z` from the input panel | User input, default 0 |
| 11 | Mid Price | Mid Black–Scholes mark | Engine |
| 12 | Sell Price | Mark at `σ − z / 2` | Engine |
| 13 | Buy Price | Mark at `σ + z / 2` | Engine |
| 14 | Option Delta | Finite difference of Mid Price around spot — unique per expiry, six decimals | Engine |

There is no Option Code column. The engine still builds `PricerRow.code` for parity checks.

Interpolation intermediates (upper maturity, lower maturity, upper forward, lower forward)
are recomputed internally and are **not** shown. Gamma and Theta from the reference sheet
are also omitted — they are not used by the unwind quote.

## Engine entry points

| File | Function | Role |
|------|----------|------|
| `lib/engine/vol-surface.ts` | `interp1` | Sorted-axis linear interpolation with flat edges |
| `lib/engine/vol-surface.ts` | `normalizeVolSurface` | Sorts expiry dates and moneyness columns; pads missing vols to 0 |
| `lib/engine/vol-surface.ts` | `interpolateVolPercent` | Bilinear strike × expiry interpolation on the normalized grid, returns vol in **percent points** |
| `lib/engine/vol-surface.ts` | `lookupVolBump` | Volatility Bump at or before the maturity (MATCH last-on-or-before) |
| `lib/engine/vol-surface.ts` | `lookupFwdSellRate` | Forward Sell Rate at the maturity (flat 6.60 percent for the September book; linear interp on a multi-point native XLSM curve) |
| `lib/engine/vol-surface.ts` | `surfaceVolDecimal` | Percent vol → decimal, plus Volatility Bump, plus forward |
| `lib/engine/pricer.ts` | `optionCode` | Engine-only keys such as `P4644123408`. Not a Pricer Table column |
| `lib/engine/pricer.ts` | `priceLeg` | One row of the Pricer Table |
| `lib/engine/pricer.ts` | `priceProductBook` | Maps `priceLeg` across all product legs |
| `lib/engine/pricer.ts` | `unwindMarkPrice` | Unwind Buy → Buy Price, Unwind Sell → Sell Price |
| `lib/engine/black-scholes.ts` | `normCdf` | Abramowitz and Stegun rational normal CDF |
| `lib/engine/black-scholes.ts` | `blackScholesPrice` | Forward Black–Scholes |
| `lib/engine/black-scholes.ts` | `blackScholesDelta` | `(Price(S + 0.5) − Price(S − 0.5)) / 1` |

## Type field map

`PricerRow` in `lib/types.ts` is the engine object behind one table row.

| Type field | Column | Unit stored |
|------------|--------|-------------|
| `code` | Engine only — not shown | string |
| `strike` | Strike Price | index points |
| `maturity` | Maturity Date | ISO timestamp |
| `valuationDate` | Unwinding Date | ISO timestamp |
| `optionType` | Option Type | `Put` / `Call` |
| `spot` | Nifty Spot | index points |
| `forwardGrowth` | Forward Growth Rate | decimal (`0.07` = 7%) |
| `discountYield` | Discount Yield | decimal (`0.08` = 8%) |
| `volatility` | Volatility | decimal (`0.16065…`) |
| `volBump` | Volatility Bump | decimal |
| `bidOffer` | Bid Offer Spread | decimal vol points |
| `price` | Price | rupees per option |
| `sellPrice` | Sell Price | rupees per option |
| `buyPrice` | Buy Price | rupees per option |
| `delta` | Delta | per index point |

The UI formats rates with `formatPct` and amounts with `formatNumber(..., 2)`. Internal
values stay full precision.

## Time and calendar

```text
tauDays  = calendar days from Unwinding Date to Maturity Date
tauYears = tauDays / 365
```

`daysBetween` in `lib/utils.ts` uses UTC midnight of each calendar date, so a timezone
shift cannot invent or drop a day. Actual/365, not Actual/365.25 and not a business-day
count. If `tauYears <= 0` the leg is treated as expired (see Expired legs below).

## Volatility surface interpolation

The **seeded** book is the October 2026 Volatility Surface in `lib/data/vol-surface-seed.json`
(`monthKey` `2026-10` in the file, **14 live expiries** 27-Oct-2026 → 26-Mar-2031, Deep plus 20
Strike Change percent columns; Deep carries the 55% vols). The golden tables below stay on the
frozen September 2026 surface in `lib/data/vol-surface-golden-sep-2026.json`.
Home shows that grid. If Mongo has no upload for the current calendar month, the latest earlier
grid is shown under the current month name, with that month's Yahoo reference prices.

The older XLSM MarketData shape that `npm run verify:xlsm` replays has **14** expiry dates
from 29-Mar-2023 through 29-Dec-2029. That is a reference-file check, not the live seed.

**Columns** — Deep is always ₹500. The other columns are Strike Change percents of the
monthly **reference** index: Reference Nifty Price for Nifty products, Reference Sensex
Price for Sensex products. 100 percent = that reference (October 2026 seed: 22,421.95 /
71,909.70 as of 1 Oct 2026; September 2026 golden: 24,090.85 / 77,264.51).
Black–Scholes still uses the live unwind spot.

### Strike interpolation

For a fixed expiry row, strike vol is linearly interpolated on the sorted strike axis
(`interp1`). Outside the first or last strike the edge value is held (no extrapolation).
The strike axis is **reference moneyness**: Deep is always ₹500; remaining columns are
`percent × Reference Nifty Price` or `percent × Reference Sensex Price` (`moneynessStrikes`).
Absolute strike prices on an XLSM MarketData row are a snapshot of an old spot (the Apr 2025 For Update
file is frozen near **25,424.65**) and are **not** used. Excel’s Pricer still interpolates
on that frozen row while Black–Scholes uses live 24,366 — that is why Unwind Diff quotes
disagree. Replay with Excel’s vol in our Black–Scholes and the option price matches to
a paisa; the app’s reference-price vol is the desk convention. See
[doc 02](02-calculation-logic.md).

```text
if K <= K_min:  vol = vol(K_min)
if K >= K_max:  vol = vol(K_max)
else:           vol = y0 + (K − K0) / (K1 − K0) * (y1 − y0)
```

### Expiry interpolation

For a target maturity the engine finds the bracketing surface expiries `T0` and `T1` and a
weight `w = (T − T0) / (T1 − T0)`. The strike-interpolated vols on those two rows are then
blended:

```text
volPercent = (1 − w) * vol(T0, K) + w * vol(T1, K)
```

Before the first surface expiry, or after the last, the nearest row is used with `w = 0`.

`interpolateVolPercent` returns **percent points** (16.065… means 16.065 percent). It does
not divide by 100. That conversion happens in `surfaceVolDecimal`.

### Decimal volatility used in Black–Scholes

```text
σ = volPercent / 100 + VolatilityBump
```

For the October seed and the September golden book, Volatility Bump is **0.00 percent**, so `σ` is exactly the
interpolated surface vol as a decimal. Example on the September 2026 grid for the golden
first leg: interpolated 14.17149079547172 percent → `σ = 0.1417149079547172`. The
reference XLSM MarketData grid at the same strike and expiry interpolates 16.065484933208093
percent.

## Forward Growth Rate

Sheet two of the Volatility Surface file (**Surface Parameters**, matched by `/param/i`)
carries a single month block:

| Parameter | Seeded value |
|-----------|--------------|
| Volatility Bump | 0.00% |
| Forward Sell Rate | 6.60% |

`lookupFwdSellRate` returns that flat 6.60 percent for every maturity in the October and September books. A
multi-point parameter sheet is still accepted and linearly interpolated by maturity date:
the sample Date / Vol Bump / Fwd table, or the native XLSM **Pricing Params** layout
(date in column B, BID / vol bump in column C, Fwd Sell rate in column H). Excel MATCH
last-on-or-before on that native sheet also resolves to **7 percent** for 2028+
expiries, so a 7 percent forward on a MarketData book is not an ambiguity versus
the app. If the parameter list is empty the function falls back to **7 percent**.

The Pricer column **Forward Growth Rate** is this number, shown as a percent.

Bid Ask Spread is **not** on the Volatility Surface file. The live table uses the **input
panel** value (default 0).

## Discount Yield — the pricer convention

This is the convention that must not be confused with the product discount rate.

```text
Discount Yield = Forward Growth Rate + 1 percent
```

Implemented inside `priceLeg` as `const discountYield = fwd + 0.01`.

| Forward Growth Rate | Discount Yield | Used for |
|---------------------|----------------|----------|
| 6.60% (September 2026 book) | **7.60%** | Option discounting `q` in Black–Scholes |
| 3.85% (legacy short tenor) | **4.85%** | Same rule on older parameter rows |

The product discount rate **7.50 percent** is **not** used on the Pricer Table. It is only
used to compound the NBFC amount in whole-book economics ([doc 02](02-calculation-logic.md)).

A row-by-row audit of the reference Pricer sheet confirmed the Discount Yield column is
always exactly one percentage point above Forward Growth.

## Black–Scholes on the forward

Let `S` be Nifty Spot, `K` the strike, `r_fwd` the Forward Growth Rate, `q` the Discount
Yield, `σ` the decimal volatility and `τ` the year fraction.

```text
F  = S * exp(r_fwd * τ)
d1 = (ln(F / K) + 0.5 * σ² * τ) / (σ * sqrt(τ))
d2 = d1 − σ * sqrt(τ)
df = exp(−q * τ)

Call = df * (F * N(d1) − K * N(d2))
Put  = df * (K * N(−d2) − F * N(−d1))
```

`N` is the standard normal cumulative distribution, implemented with the Abramowitz and
Stegun rational approximation in `lib/engine/black-scholes.ts` (`normCdf`). Coefficients:

```text
a1 =  0.254829592
a2 = −0.284496736
a3 =  1.421413741
a4 = −1.453152027
a5 =  1.061405429
p  =  0.3275911
```

If `vol <= 0` or `spot <= 0` or `strike <= 0` on a live (non-expired) leg, the price is
returned as **0**.

The mid **Price** column is this value. For Nifty Accelerator - 961 every leg is a Put.

## Bid Ask Spread

`z` is the Bid Ask Spread from the input panel, default **0**. The API floors a negative
value at 0 (`Math.max(..., 0)`).

```text
Sell Price = BlackScholes(σ − z / 2)     floored at vol 1e-8
Buy Price  = BlackScholes(σ + z / 2)
```

When `z = 0` (the seeded default and the golden sample), Price = Sell Price = Buy Price.

## Delta

```text
Delta = (Price(S + 0.5) − Price(S − 0.5)) / (2 * 0.5)
      = Price(S + 0.5) − Price(S − 0.5)
```

A one-index-point centred finite difference. Puts carry a negative delta. Expired legs
report Delta **0**.

## Option Code

```text
letter     = "C" if option type starts with C, else "P"
serialDay  = days from 1899-12-30 to the expiry date (workbook serial day)
OptionCode = letter + serialDay + round(strike)
```

`toSerialDay` uses the same UTC calendar arithmetic as `daysBetween`. Example: Put, expiry
23-Feb-2027, strike 23,408 → `P4644123408`.

These codes are the same string stored as `sdCode` on each engine leg. They are **not** an
upload column on the 28-column Product Master input (Home Desk Book)
and they are **not** shown on the Options Book UI or the Pricer Table.
If a seeded or uploaded product already stores `sdCode` on a leg, `priceLeg` prefers that
string; otherwise it rebuilds the code from expiry and strike.

## Expired legs

If the Unwinding Date is on or after the Option Expiry Date (`τ ≤ 0`) — including an
observation date that has already passed — the Pricer does not settle at intrinsic.
Excel’s Black–Scholes cell errors, and the Main Master `IFERROR` lookup stores 0.
Single and multi desks share this path:

| Field | Calls and puts |
|-------|------|
| Price / Sell / Buy | **0** |
| Implied Volatility | **0** (no surface lookup; expiry may be absent from the grid) |
| Volatility Bump | **0** |
| Forward Growth / Discount Yield | **0** |
| Bid Ask Spread | **0** (ignored on a settled option) |
| Delta | 0 |

The Pricer table stays 0 after expiry (Excel IFERROR path) — do not change that path.
The Options Book shows the in-the-money price on every expired option, and that price is
the same whether the unwind action is Buy or Sell. A put is max(strike − spot, 0). A call
is max(spot − strike, 0). The spot is the Yahoo close on or before that leg's own expiry.
Original Sell pays it. Original Buy receives it as a positive inflow. Same strike and the
same expiry spot produce the same price. Each leg's cash is that price times the Unwind
Quantity on the row. Net Premium Outflow is the sum of every leg's cash, live marks
included, and that sum enters Unwind Value. Out-of-the-money expired options stay 0.

| Surface | Expired in-the-money option | Expired out-of-the-money |
|---------|-----------------------------|--------------------------|
| Pricer Table | price / IV / rates = **0** | **0** |
| Options Book table | in-the-money price × Unwind Quantity (bold). Sell pays. Buy receives. | **0** (faint) |
| Net Premium Outflow / Unwind Value | sum of every leg's Premium Outflow Amount | expired legs contribute **0** |

Covered by `npm run verify:edge`.

## Dynamic inputs

| Input | Range | Spot source |
|-------|-------|-------------|
| Unwinding Date | Allotment date through today | — |
| Nifty Spot | Any positive number | Yahoo Finance live for today, historical close otherwise; user may override |
| Bid Ask Spread | Zero or positive | Typed percent, stored as a decimal |

Changing any of these reprices every row. Choose Underlying Nifty or Sensex; that index
level is the Black–Scholes spot and the vol moneyness grid.

## Worked example: first golden row

Valuation **21-Feb-2025**, Nifty Spot **22,800**, Bid Ask Spread **0**, Volatility Bump
**0**. Leg `P4644123408` — Put, strike **23,408**, maturity **23-Feb-2027**. Numbers below
are the **September 2026** golden surface (`vol-surface-golden-sep-2026.json`). Reference Nifty Price **24,090.85** (100% column,
as of 1 Sep 2026). Sensex products use Reference Sensex Price **77,264.51** on the same
percent grid.

| Step | Value |
|------|-------|
| Serial day of 23-Feb-2027 | 46,441 |
| Option Code | `P` + `46441` + `23408` = `P4644123408` |
| Calendar days `τ` | 732 |
| Year fraction | `732 / 365` = 2.0054794520547945 |
| Strike moneyness | `23,408 / 24,090.85` ≈ 0.971655 |
| Interpolated vol (percent) | 13.01982918496008 |
| Decimal `σ` | 0.1301982918496008 |
| Forward Growth Rate | 6.60% |
| Discount Yield | 7.60% |
| Forward `F` | `22,800 * exp(0.066 * τ)` |
| Discount factor | `exp(−0.076 * τ)` |
| Mid Price | **684.61** (`roundDeskMoney` after Black–Scholes) |
| Sell Price = Buy Price | 684.61 (`z = 0`) |
| Delta | −0.2473 |

Replay the same inputs on the XLSM MarketData grid (`npm run verify:xlsm`) and the engine
returns vol **16.065484933208093 percent**, price **944.33**, delta **−0.2635** — matching
the Pricer sheet of `Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) - Sample.xlsm`
to a few paise. The rows below are the September golden file; the live desk prices on the October seed. An open desk
carries the latest grid under the current month and replaces the 100% anchors with that month's Yahoo close.

## Golden rows

These ten codes are locked in `scripts/verify-pricer-sheet.ts` (`npm run verify:pricer`).
Volatility must match to `1e-9`, Discount Yield must be exactly 7.60 percent (Forward Sell
6.60% + 1%), Price to two decimals after `roundDeskMoney`, Delta to `1e-4`. Valuation
21-Feb-2025, spot 22,800, bump 0, `z = 0`.

| Engine code | Strike | Maturity | Volatility | Price | Delta |
|-------------|-------:|----------|-----------:|------:|------:|
| P4644123408 | 23,408 | 23-Feb-2027 | 0.1301982918496008 | 684.61 | −0.2473 |
| P4653223408 | 23,408 | 25-May-2027 | 0.13594790155043873 | 719.85 | −0.2359 |
| P4663023408 | 23,408 | 31-Aug-2027 | 0.14177966670814135 | 756.20 | −0.2253 |
| P4672123408 | 23,408 | 30-Nov-2027 | 0.14683552086909693 | 787.69 | −0.2166 |
| P4644122880 | 22,880 | 23-Feb-2027 | 0.13522577583153925 | 598.55 | −0.2167 |
| P4653222880 | 22,880 | 25-May-2027 | 0.1405938688716134 | 635.76 | −0.2089 |
| P4663022880 | 22,880 | 31-Aug-2027 | 0.14616699327617522 | 674.71 | −0.2015 |
| P4672122880 | 22,880 | 30-Nov-2027 | 0.1509682867565014 | 707.83 | −0.1951 |
| P4644119008 | 19,008 | 23-Feb-2027 | 0.19964900850897632 | 359.79 | −0.1030 |
| P4653219008 | 19,008 | 25-May-2027 | 0.19263252721955382 | 341.61 | −0.0967 |

## How this maps to the reference Pricer sheet

The reference sheet is a large shared book. Only the rows whose Option Code belongs to
Nifty Accelerator - 961 are in scope. Column names on that sheet and the app:

| Reference header | App column |
|------------------|------------|
| Code | Engine only — not shown on the Pricer Table |
| Strike | Strike Price |
| Maturity | Maturity Date |
| Valuation Date | Unwinding Date |
| P / C letter | Option Type |
| Spot Price | Underlying Spot Level |
| Forward Growth | Forward Growth Rate |
| Discount Yield | Discount Yield |
| Volatility | Volatility |
| Vol Bump | Volatility Bump |
| BID/OFFER | Bid Offer Spread |
| Price (INR) | Price |
| Sell Price | Sell Price |
| Buy Price | Buy Price |
| Delta | Delta |

The reference XLSM prices only ten of the 24 product legs and leaves the fourteen deep
out-of-the-money legs at a **zero** unwind price. This engine marks **every** leg. On that
file’s MarketData the quote is 143.17 percent versus the workbook 142.96 percent. The live
September 2026 quote is about **147.18 percent**. Documented in
[doc 02](02-calculation-logic.md). The ten commonly priced XLSM legs match.

## Unwind mark used by the calculator

`unwindMarkPrice(row, originalSide)`:

- Original **Sell** → Unwind Buy → **Buy Price**
- Original **Buy** → Unwind Sell → **Sell Price**

With Bid Ask Spread at zero the two prices are equal, so the mark is simply Price.
After expiry both prices are 0, so the Options Book mark and the outflow are 0.

Live **Price**, **Sell Price**, and **Buy Price** are `roundDeskMoney` — two decimal places
after Black–Scholes — the same paisa rounding Excel currency cells use. Options Book
outflow multiplies those rounded marks, so display and rupee cash never disagree.

## HTTP contract

This app does not ship the Unwinding Calculator's single-product `POST /api/pricer`. The
Pricer Table page runs `priceProductBook` in the browser on the selected product.

## UI and export

- Route: `/portfolio/pricer`
- Same full-width Input Parameters panel as the Unwinding Calculator (2 / 4 / 7-column fill)
- Reveal-to-view, then the full 14-column table (no Option Code) with row-span merging on repeated values
- Table chrome: Primary SP premium sticky header, dual H+V scroll (`.desk-table-scroll`)
- **Download Excel** and **Download PDF** sit below the table — same Primary SP logo,
  masthead, gold borders, disclaimer and `SP-Pricer-Table-…` filename as the Unwinding
  Calculator exports
- Numbers display to two decimal places; percents use the shared `formatPct` helper
- Dates on screen use `formatDeskDate` (DD-MMM-YY); the Volatility Surface explorer uses
  `formatDeskDateFull` (DD-MMM-YYYY)

## Verification

```bash
npm run verify:pricer    # 40 golden row assertions
npm run verify           # includes pricer + parity + edge + samples + typecheck
```

If a FAIL appears, compare the named Option Code in the script against the table above and
against `lib/data/vol-surface-seed.json`. Volatility mismatches point at interpolation;
yield mismatches point at the plus-one-percent convention; price mismatches of more than
one paisa point at the Black–Scholes implementation. See [doc 07](07-testing-debug.md).
