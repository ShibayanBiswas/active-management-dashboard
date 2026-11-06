# Input Parameters Guide

Last updated 06-Nov-2026 IST.

## Desk Inputs

| Field | Where Used |
| --- | --- |
| Valuation Date | Days invested, observation status, expired versus live legs, residual days to maturity |
| Current Nifty | Live leg prices and deltas; centre of the scenario ladder |
| Assumed Nifty | IRR at Assumed Level and Exit Value Assumed |
| Level Revaluation | Delta Approximation or Full Black Scholes Reprice, for the assumed level and the ladder |
| Forward Rate Percent | Black Scholes forward growth |
| Discount Spread Percent | Discount rate is Forward Rate plus this spread |
| Delta Rate Percent | Black Scholes delta |

## Product Master Upload

One row per option leg; product columns repeat on every leg row and the first row wins. Header spellings are matched loosely (case and punctuation ignored); the sample at `public/samples/product-master-sample.xlsx` shows the canonical layout.

| Column | Required | Used For |
| --- | --- | --- |
| Product Name | Yes | Identity; the product id is its slug |
| Product Code | | Search and the product page |
| Trade Date | | Product page |
| Allotment Date | Yes | Days invested |
| Maturity Date | | Residual days for Expected Difference |
| Tenor Days | | Max IRR |
| Mobilisation | Yes | Net mobilisation, margin, debentures |
| Initial Nifty Level, Contingent Level | | Product page |
| Face Value | Yes | Debentures, IRR, terminal |
| Coupon | | Max IRR and the contractual terminal |
| Actual Target | | Residual Target |
| Margin Percent, IB, Transaction Cost, Issuance Cost | | Net mobilisation |
| Product Rate, Premium Rate, Margin Rate | | Growth of each pot; Premium Rate also grows settled payoffs and open outflow |
| Observation Date 1 to 7 | | Observation lifecycle |
| Option Type, Strike, Side, Expiry, Quantity | Yes per leg | Pricing key and outflow; quantity is signed, negative for sold options |
| Product Price, Product Premium | | Premium; Product Premium falls back to −Product Price × Quantity |

A missing or zero Coupon or Tenor is reported and flagged on the desk, never silently used.

## Volatility Surface Upload

A header row starting with `Expiry` (or `Reference Level`) followed by moneyness percents (55 to 155), then one row of vols in percent points per expiry. The reference level comes from a `Reference Level` cell followed by the level, or from the 100 percent column of a strike row under the header. A sheet with `Expiry` and `Spread` columns replaces the bid ask spread table. Used for every live leg's vol.

## NSE Option Chain Upload

The NSE option chain CSV or workbook for one expiry: calls left of `STRIKE`, puts right. Bid, Ask and LTP are read on both sides. Enter the expiry date, or keep `DD-Mmm-YYYY` in the file name. Used for market bid and ask on Pricing.

## Fixing History Upload

Optional `Date` and `Close` columns. Overrides or fills the Nifty closes used for observations and expired legs; anything still missing is fetched from Yahoo when the book loads.

## Desk Key

When `DESK_WRITE_KEY` is set on the deployment, saving an upload needs the same key in the Desk Key field. Validate (dry run) never needs it.
