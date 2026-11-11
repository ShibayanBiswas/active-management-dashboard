# 04 — Input Files and Upload

Two workbooks drive the desk. Both are downloadable from Home and from the Upload page.
Uploads are open — there is no login. Calculators stay public. First load uses the seeded
book. An upload replaces that book on Home and on both calculators.

Sample builder: `npm run build:samples` → `scripts/build-sample-inputs.ts`.

## 1. Volatility Surface Input (monthly)

**Sample path:** `public/samples/Vol_Surface_Input_November.xlsx` (current desk month;
`monthKey` `2026-11`)

### Sheet 1 — Vol Surface

MarketData grid used for bilinear interpolation ([doc 03](03-pricer-logic.md)).

| Axis | Contents |
|------|----------|
| Column labels, row 1 | Strike Change: Deep · ₹500, then percent columns (sample 55% through 150%) |
| Row 2 | **Nifty Strikes** — Deep ₹500, then live Excel formulas `Surface Parameters!$B$8` × moneyness (seed Reference Nifty **23,053.10**) |
| Row 3 | **Sensex Strikes** — Deep ₹500, then live Excel formulas `Surface Parameters!$B$9` × moneyness (seed Reference Sensex **74,459.53**) |
| Row labels | Corner cell **Expiry Date**, then one date per expiry |
| Body | Implied volatility in **percent points**, two decimals (57.36 means 57.36%) |

Expiry count and strike-percent columns may change. Every other label, sheet order and
Deep column must match the sample. The November 2026 seed / sample has **14** live
expiries (23-Nov-2026 → 26-Mar-2031) and **20** percent columns plus Deep. Deep · ₹500 carries
the same vols as the 55% column.

Absolute strike prices are **not** stored as the interpolation axis. Deep is always ₹500 for Nifty or Sensex. Every
other column is `Reference Nifty Price × percent` for Nifty products and
`Reference Sensex Price × percent` for Sensex products. Bid Ask Spread is **not** on this file —
it lives on Input Parameters.

The Desk Book on Home renders this **full** grid (Deep plus every uploaded
percent column × every uploaded expiry), not a snapshot, in the same Primary SP premium
table as Options Book and Pricer. Cards and tables size to their copy; if they overflow,
the rail or table scrolls horizontally. Sample workbooks keep the Anand Rathi logo and
masthead **above** the grid. Every table cell — headers and values — is uncolored: dark
labels, thin gray borders, no maroon or gold fills inside the sheet.

### Sheet 2 — Surface Parameters

Sheet name is **Surface Parameters** (parser still matches `/param/i`, so legacy
“August Parameters” / “Pricing Params” names also resolve). A single month block. No
other dates. No text in brackets.

| Parameter | Seeded value | Notes |
|-----------|--------------|-------|
| Month | November 2026 (`monthKey` `2026-11`) | Roll anchors at the start of each calendar month |
| Reference Nifty Price | 23,053.10 | Cell **B8**; 100% Strike Change Nifty anchor as of **1 Nov 2026** (the 30 Oct close); Nifty strike row formulas × moneyness |
| Reference Sensex Price | 74,459.53 | Cell **B9**; 100% Strike Change Sensex anchor as of **1 Nov 2026** (the 30 Oct close); Sensex strike row formulas × moneyness |
| Volatility Bump | 0.00% | Added to interpolated vol |
| Forward Sell Rate | 6.60% | Flat for the month; Pricer Discount Yield is this plus 1% |

The Desk Book **Surface Parameters** tab is this sheet: SpecRail cards plus a
key-value table. Sheet two of the sample file uses the same light header wash and thin
gray borders as Product Master.

### Parser behaviour

- File: `lib/workbook/parsers.ts` → `parseVolSurfaceWorkbook`
- Finds the header row by the label `Strike Change` or MarketData `Strike`
- Reads expiry dates from the blue column C block in `Vol Surface Aug'26.xlsx`
  (30-Jun-2026 through 30-Apr-2031). Dates are stored as UTC midnight calendar days so
  they never display a day early.
- Finds moneyness fractions after Deep; Deep Strike stays ₹500
- Expiry dates sit in column C; **Nifty Strikes**, **Sensex Strikes**, and **Expiry Date**
  label rows are skipped, as are XLSM absolute-strike numeric rows
- Accepts three Pricing Params layouts: the Surface Parameters key/value block (Reference Nifty
  Price / Reference Sensex Price / Volatility Bump / Forward Sell Rate; legacy
  **Reference Underlying Price** still maps to Nifty), the legacy tabular Date / Volatility Bump /
  Forward Sell Rate table, and the native XLSM **Pricing Params** sheet (date in column B, BID in column C,
  Fwd Sell rate in column H). The September sample becomes one month-end **6.60 percent**
  point. Uploading the desk XLSM now keeps the dated forward curve instead of injecting
  a synthetic month-end 7 percent row.
- Labels accepted: `Volatility Bump` and legacy `Vol Bump`
- Percents typed as `7` or `7%` or `0.07` are normalised (`asFraction`: values greater
  than 1 are divided by 100)
- Surface label follows the month key. The seed file is September 2026. The desk shows the
  current month when it is carrying the previous grid forward
- Month key defaults to the current month when none is supplied
- Upload month dropdown lists **the current calendar month and year only** and is not a free-text field
- Runtime load: if Mongo has no surface for the current calendar month, the latest
  stored `monthKey` surface is used

If the header row or every expiry row is missing, the parser throws and the upload route
returns HTTP 400.

## 2. Product Master Input

**Sample path:** `public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx`

Only the input columns of the reference Main Master are in this file. Derived
columns are recomputed by the engine and must not be uploaded. The Desk Book Product
Master tab shows the same headers on screen; the downloadable sample uses an uncolored
table: bold dark headers, thin gray borders, frozen header row, and uncolored data cells.

### Columns (left to right)

| Column | Level | Notes |
|--------|-------|-------|
| Product Name | Product | Merged across all 24 legs |
| Trade Date | Product | Native date |
| Product Code | Product | ARG24SP06 Series I |
| Mobilization Amount | Product | Native number |
| Unwinds | Product | Native number |
| Initial Underlying Level | Product | Always present; quantity formulas use this level (Nifty or Sensex) |
| Contingent Level | Product | Always present; premium percent uses this when greater than 0, else Initial Underlying Level |
| Allotment Date | Product | Native date |
| Tenor Days | Product | **Live formula** `Maturity − Allotment` |
| Maturity Date | Product | Native date |
| Product Discount Rate | Product | Percent format |
| Premium Discount Rate | Product | Percent format |
| Payoff Formula | Product | Text |
| Contingent Coupon | Product | Percent format |
| Option Type | Strike group | Merged per 4 expiries |
| Strike Price | Strike group | Merged per 4 expiries |
| Spreads | Strike group | Merged per 4 expiries |
| Original Buy or Sell | Strike group | Merged per 4 expiries |
| Option Expiry Date | Leg | Native date, one per row |
| Required Quantity | Leg | **Live formula** (see below) |
| Product Price | Leg | Per-leg initial mark, not a single product value |
| Reported Inbuilt | Product | Percent format |
| Transaction Cost | Product | Percent format |
| Issuance Cost | Product | Percent format |
| Margin Cost | Product | Percent format; blank becomes 0 |
| Face Value | Product | Native number |
| Total Funds For Margin | Product | Native number |
| Margin Funding Rate | Product | Percent format |

### Header aliases the parser accepts

The first sheet is scanned for a header row whose first Product label may sit in
**column A** (samples) or **column B** (legacy desk XLSM Main Master). Each field then
matches any of these headers (case insensitive):

| Field | Accepted headers |
|-------|------------------|
| Product Name | Product Name, Product |
| Trade Date | Trade Date, Month |
| Product Code | Product Code |
| Mobilization | Mobilization Amount, Mobilization |
| Unwinds | Unwinds, Number of Unwinds |
| Initial Underlying Level | Initial Underlying Level, Initial Nifty Level (legacy) |
| Contingent Level | Contingent Level |
| Allotment Date | Allotment Date |
| Tenor Days | Tenor Days, Tenor in Days, Tenor |
| Maturity Date | Maturity Date |
| Product Discount Rate | Product Discount Rate, Prd Disc Rate |
| Premium Discount Rate | Premium Discount Rate, Prem Disc Rate |
| Payoff Formula | Payoff Formula, Formulae |
| Contingent Coupon | Contingent Coupon Rate, Contingent Coupon, Coupon |
| Option Type | Option Type, Req. Options, Options |
| Strike Price | Strike Price, Req. Strike, Strike |
| Spreads | Number of Spreads, Spreads, Req. Spreads |
| Original Buy or Sell | Original Buy or Sell, Original Buy Sell, Buy / Sell, Buy/Sell |
| Option Expiry Date | Option Expiry Date, Option Expiry, Req. Expiry, Expiry |
| Required Quantity | Required Quantity, Req. Quantity, Quantity |
| Product Price | Initial Product Price, Product Price, Prd Price |
| Inbuilt | Inbuilt Cost Rate, Reported Inbuilt, Inbuilt |
| Transaction Cost | Transaction Cost Rate, Transaction Cost, Tran Cost (%), Tran Cost |
| Issuance Cost | Issuance Cost Rate, Issuance Cost |
| Margin Cost | Margin Cost |
| Face Value | Face Value |
| Total Funds For Margin | Total Funds For Margin, Total Funds Held for Margin, Funds Reserved for Margin |
| Margin Funding Rate | Margin Funding Rate |

Merged cells are **forward-filled** column-wise before rows are read. Long note rows (first
cell longer than 60 characters and the rest empty) stop the scan. Desk XLSM files often
claim a million-row `!ref`; the multi parser clips the sheet to the sparse used range
before reading.

`qtyDivisor` is **not** an upload column (engine default 1). `SD Codes` / `Option Code` are
optional on a Main Master File and are stored on each leg when present; the engine still
rebuilds a code from expiry and strike when they are absent.

Desk rules for Contingent Level and Margin Cost:

| Rule | Behaviour |
|------|-----------|
| Contingent Level blank or zero | Fall back to Initial Underlying Level |
| Margin Cost, Contingent Coupon or Margin Funding Rate blank | Treated as 0 (participation payoffs carry no fixed coupon) |
| Tenor Days blank | Allotment Date to Maturity Date in days |
| Trade Date blank | Allotment Date |
| Allotment Date, Maturity Date, Initial Underlying Level, Face Value, Reported Inbuilt, Transaction Cost, Issuance Cost, Product Discount Rate or Premium Discount Rate blank | The upload is rejected and the popup names each product and cell. The desk never fills a product fact with another product's value |
| Coupon typed as 1.18 | Stays 118% (`asCoupon`); 118 also becomes 1.18 |
| SD Codes | Optional; stored on the leg when present |

Sell legs with a positive Required Quantity are signed negative so Product Premium matches
the engine convention on both desks.

A product is **Sensex** when the name or code matches Sensex, S&P BSE, or BSE Sensex
(substring, including glued names such as `SensexAccelerator`). Otherwise it is Nifty.
Bank Nifty stays Nifty. Sensex products interpolate vol on Reference Sensex Price.

### Live formulas in the sample

```text
Tenor Days        = MaturityDate − AllotmentDate
Required Quantity = IF(Side = "Sell", −1, 1)
                    × Spreads × Mobilization / InitialNifty / 4
```

The parser forward-fills merged cells and reads formula **results**, so the sample
round-trips through `scripts/test-sample-roundtrip.ts`.

### Styling

- Uncolored headers and data cells (including merged ranges and strike/parameter rows)
- Bold dark Title Case labels, thin gray hairline borders, compact Calibri 9pt
- Frozen header row, gridlines off, Anand Rathi Wealth logo in the brand block above the table
- No maroon, gold, or stone fills inside the table

The on-screen Desk Book Product Master uses **27** columns (`DESK_MASTER_HEADERS` —
Contingent Level omitted because it equals Initial Underlying Level). Excel samples and uploads
keep all **28** columns.

### Default product check

The sample and the Mongo seed must match the reference Main Master yellow columns for
Nifty Accelerator - 961. First-leg Product Price **3,215.70** and Product Premium
**28,39,88,423.19** are locked in `npm run verify:parity`.

## Upload flow

Viewing and uploading are both public. There is no login. Header shortcuts on the top
right of every page open the same Volatility Surface and Product Master file pickers.

1. First load uses the baked Product Master and Volatility Surface seeds.
2. User drops a file on `/upload` or uses the header shortcuts.
3. `validateDeskUpload` checks the workbook against the sample schema
   (`lib/workbook/upload-schema.ts`). Files larger than **96 MB** are rejected (the full
   calculator workbook is not an input). The parser reads every sheet, so a Product Master
   on Main Master File or a surface on MarketData still matches. Wrong type, missing
   labels, or a Product Master uploaded as a Volatility Surface returns HTTP 400 and an
   **Upload Failed** popup. A JSON body or a missing file also returns JSON 400, not an
   HTML 500. The popup is a page overlay, not a card inside the header.
4. A matching file is parsed, kept in process memory, and written to Mongo when Atlas is
   reachable. An **Upload Complete** popup lists expiries and strike percents, or product
   name and leg count.
5. `refresh()` reloads `/api/multi/dataset`. Home Desk Snapshot and Desk Book tables show
   the new book immediately.
6. **Edit Volatility Surface** saves through `POST /api/surface`. Expiry rows and
   strike-percent columns can be added or removed. Deep stays ₹500. Interpolation sorts
   dates and moneyness before lookup so an edited grid cannot mis-price because rows were
   entered out of order. Unwinding and Pricer POST the saved surface with each calculate,
   so a Vercel instance never marks an older in-memory grid.

Volatility Surface: expiry rows and strike-percent columns may be added or removed.
Product Master: the 28 sample column labels stay required.

## 3. Multiple Product Master Input

**Sample paths:**
`public/samples/Product_Master_Input_Multiple_Products.xlsx` (merged repeats) and
`public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx` (same values
written on every row; regenerated by `npm run build:samples`, about **90 MB**, gitignored).

Same **28 input columns** and the same clean light-header / gray-border styling as the
single-product sample. One workbook holds the collated FY21–FY27 multi book (**2,505
products / 79,190 live legs**) after dropping blank, NaN, and zero Required Quantity rows
and keeping one Product Code (desk ISIN / series) per product — preferring the richer live
leg book when the same code appears in more than one FY XLSM. Products are sorted ascending
by trade date. Rebuild the seed with `npm run collate:multi` (`scripts/collate-multi-masters.ts`),
then `npm run build:samples`. **Option Expiry Date is one native date per option row** —
every remaining expiry stays on the file. The desk never collapses that column to a single
observation date. Main Master rows whose Required Quantity is blank, NaN, or zero are unused
expiry slots and are **omitted** from the sample, the Mongo seed, and every upload parse.
Product-level cells merge down each product in the merged sample. The repeated-rows sample
writes the same product-level values on every option row and **auto-fits each column to the
longest cell** so payoff formulae and long names are not clipped. Option Type, Strike Price,
Spreads and Original Buy or Sell merge across consecutive identical legs. Required Quantity
is the signed master quantity (not the single-product `/4` formula, because books do not all
split four ways).

Both reference calculators use a **Main Master File** with the same input labels.
The Apr 2024 sample names the trade-date column **Trade Date**; later FY books often name
it **Month**. Contingent Level equals Initial Underlying Level when it is missing or zero.
Margin Cost blank is zero. Sell +quantity is flipped to the engine sign. Derived master
columns (Mobilization Left, Premium, Unwind Prices, Grown Value, Unwind Quote, deltas) are
not uploaded — `computeUnwind` recomputes them on both desks. The Apr 2025–Mar 2026 **For
Update.xlsm** book remains a subset lock in `npm run verify:multi-parse` (not the full
collated seed).

### Main Master File tally (Apr 2024 sample vs Apr 2025 book)

Input fields that the desk maps. Extra calculator columns stay on the XLSM only.

| Desk / sample header | Apr 2024 XLSM | Apr 2025 XLSM |
|----------------------|---------------|---------------|
| Product Name | Product | Product |
| Trade Date | Trade Date | Month |
| Product Code | Product Code | Product Code |
| Mobilization Amount | Mobilization | Mobilization |
| Unwinds | Unwinds | Unwinds |
| Initial Underlying Level | Initial Nifty Level | Initial Nifty Level |
| Contingent Level | Contingent Level = 17,600 | Contingent Level = 22,400 |
| Allotment Date | Allotment Date | Allotment Date |
| Tenor Days | Tenor | Tenor |
| Maturity Date | Maturity Date | Maturity Date |
| Product Discount Rate | Prd Disc Rate | Prd Disc Rate |
| Premium Discount Rate | Prem Disc Rate | Prem Disc Rate |
| Payoff Formula | Formulae | Formulae |
| Contingent Coupon | Coupon (1 = 100%) | Coupon (1.18 = 118%) |
| Option Type | Req. Options | Req. Options |
| Strike Price | Req. Strike | Req. Strike |
| Spreads | Req. Spreads | Req. Spreads |
| Original Buy or Sell | Buy / Sell | Buy / Sell |
| Option Expiry Date | Req. Expiry | Req. Expiry |
| Required Quantity | Req. Quantity (already signed) | Req. Quantity (positive Sell → signed) |
| Product Price | Prd Price | Prd Price |
| Reported Inbuilt | Reported Inbuilt | Reported Inbuilt |
| Transaction Cost | Tran Cost (%) | Tran Cost (%) |
| Issuance Cost | Issuance Cost | Issuance Cost |
| Margin Cost | Margin Cost (blank → 0) | Margin Cost (blank → 0) |
| Face Value | Face Value | Face Value |
| Total Funds For Margin | Total Funds For Margin | Total Funds For Margin |
| Margin Funding Rate | Margin Funding Rate | Margin Funding Rate |

First product checks: Nifty Accelerator - 961 / ARG24SP06 Series I (24 legs, coupon 100%,
contingent 17,600) and Nifty Accelerator - 1567 / ARFS26SP01 Series I (42 live legs on the
collated book after blank-qty drop and exact-clone drop, coupon 118%, contingent 22,400).
Neither book has blank mapped inputs after forward-fill.

## Downloads vs reference XLSM vs desk

Three layers — do not expect byte-identical Excel files:

| Layer | What it is | Logic |
|-------|------------|-------|
| **Reference XLSM** (eight FY21–FY27 Downloads masters, Nifty + Sensex) | Native desk calculators with Main Master File, MarketData strikes, Calculator sheet | Source of product facts + option legs. Collate (`npm run collate:multi`) keeps **unique Product Codes** only (richer leg book on collisions; blank/zero qty dropped). A repeated option row stays when its price, spread, or quantity differs. An exact clone drops. While one product name continues, the code stays the code on the first row of that name. Blank Buy/Sell trusts already-signed Req. Quantity (negative → Sell). Locked **2,505 / 79,190**; all eight files ⊆ seed. Derived Unwind Quote / Grown Value / deltas on those sheets are **not** authoritative for the web desk — Excel often freezes strike rows / uses different spot rules. Live option marks on the web desk always come from `priceLeg` (Pricer). **Premium Credited is always positive** on the desk: the absolute value of Product Price times negative Required Quantity, summed over the live legs. |
| **Web desk** | Mongo / seed book + live Yahoo spots + November surface | Same `computeUnwind` / Black–Scholes for Single and Multi. Product Book / Unwinding / Pricer only list **Maturity Date ≥ as-of**. Desk Book adds an **Expired** tab for past-maturity products. Live observation tabs further split by remaining option expiries. **Pricer** matches Excel IFERROR → 0 after expiry. An expired Options Book price is the in-the-money amount for both Unwind Buy and Unwind Sell. A sold option pays it. A bought option receives it as a positive inflow. Net Premium Outflow is the sum of the leg amounts. Out-of-the-money expired options stay 0. |
| **Download Excel** (Product Book, Unwinding Summary + Options Book, Pricer Table) | Styled maroon/gold exports of **what is on screen** | Columns locked in `lib/workbook/export-columns.ts`. Dynamic column widths, **no cell indent**. Master fields map through; Unwind Quote Amount and IRRs are engine output. Options Book / Pricer marks match the screen tables (`₹`, blank `-`), including counted expired intrinsic on the Options Book and NBFC cards. A sold option pays it. A bought option receives it. Pricer expired prices stay 0. |

Product Book download column map (master vs engine) is `PRODUCT_BOOK_SOURCE_MAP` in `export-columns.ts`. The sheet is one row per option leg: Premium Outflow after Client Internal Rate of Return, then the five Options Book money columns. Option Expiry Dates are the New Primary Observation Average 1–7 dates (series + name + rollover phase). Verify with `npm run verify:downloads`.



See [05 — MongoDB and seeding](05-mongodb-and-seed.md).
