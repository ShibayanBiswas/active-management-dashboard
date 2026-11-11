# 06 — Routes and UI

Visual language follows the Primary SP Dashboard (gold `#d4b24c`, maroon `#7a1e2c`, serif
headings) with the Dynamic Probability Calculator card density. Full forms everywhere.
Title Case on buttons, tabs and card labels. No brackets in user-facing copy. Numbers to
two decimal places.

Formulas: [doc 02](02-calculation-logic.md) and [doc 03](03-pricer-logic.md). Uploads:
[doc 04](04-input-files.md).

## Navigation

Defined in `lib/navigation.ts`. Brand header: logo, vertical rule, serif title
**Active Management Dashboard**, then two top-right shortcuts, **Upload Volatility
Surface** and **Upload Multiple Product Master**. Each opens a file picker, validates
against the sample, and shows a success or format-error popup as an independent overlay.
The single-product 961 sample cannot wipe the multiple-product book.

This app is the Unwinding Calculator's Multiple Product Version served at the root routes.
There is no Single Product Version and no version switch. SP Workstation frames the app
and moves it between these routes with `postMessage({ type: "active-management:navigate",
path })` (`lib/embed-navigation.ts`, `components/layout/embed-navigation.tsx`).

| Area | Route | Nav label | Notes |
|------|-------|-----------|-------|
| Home | `/` | Home | Product Book, Post Observation Analytics, Desk Snapshot (four cards), Desk Modules, Desk Book, sample downloads |
| Unwinding Calculator | `/portfolio/unwinding` | Portfolio → Unwinding Calculator | Quote, facts, funding, whole book, options, then Active Management, Pricer Table and Scenario Grid |
| Logic Atlas | `/intelligence` | Intelligence | Pipelines and primitives only — Desk Book explorer stays on Home |
| Upload | `/upload` | Upload | Open dropzones, no login |

There is **no Desk tab** and **no Analytics route**. The Portfolio section holds exactly
Unwinding Calculator and Pricer Table. The `/` home product book shows, left to right: Sr. No., Product
Name, Product Code, Unwind Quote Amount, Date As Of Today, Product Internal Rate of Return,
Client Internal Rate of Return, Premium Outflow, Residual Internal Rate of Return, then
Product Facts (Face Value, Initial Underlying Level, Contingent Coupon through Residual Tenor — **Contingent Level is omitted** because it duplicates Initial Underlying Level on this book), then the five Options Book columns. Unwind Quote Percent is
not on that home table — the rupee Unwind Quote Amount is the headline mark
(`FaceValue × QuotePercent`). That is the column compared with Excel Main Master Unwind
Quote in Unwind Diff; see [doc 02](02-calculation-logic.md) for why those files still
differ (live moneyness versus Excel’s frozen strike row). Both desks upload the same
28 input columns; Unwind Quote is never read from the master.
The Product Book screen shows the table only. It does not print a column lecture. Each leg row keeps every column, so scrolling cannot slide a later column under Product Name. The product name is filled on the first row of that product and again at the top of the scroll window. Observation Date is First, Last, or Any. Start Date defaults to the oldest option expiry on the ongoing book. End Date defaults to today.
**Reveal** filters the current tab to products whose option expiries fall in that window. The table is one row per live option leg:
product facts club together, then the full Options Book in its own order: Option Type, Strike Price, Number of Spreads, Original Buy or Sell, Unwind Buy or Sell, Unwind Quantity, Option Expiry Date, Product Premium Per Spread, Product Premium Amount, Unwind Option Price, and Premium Outflow Amount. Premium Outflow (the rupee card) is the
column immediately after Client Internal Rate of Return. Export View and Export Workbook use that same layout.

The home Product Book has **Export View** and **Export Workbook** on the search row, then **Ongoing**, then
Observation in 3 / 2 / 1 Month tabs on Product Book. Desk Book adds an **Expired** tab for
products whose Maturity Date is before the Asia/Kolkata as-of day. Product Book, Unwinding
Calculator, and Pricer only list **live-maturity** products (Maturity Date ≥ as-of) — matured
names never appear in those dropdowns or in the Product Book table. Desk Book Observation tabs
then filter by remaining unique Option Expiry Dates (Ongoing = every live-maturity product;
1 / 2 / 3 Month = the 2nd / 3rd / 4th remaining date; Expired = past maturity). Labels match
Primary SP; the dates are not calendar-month distance — on this book the next expiries sit
years out, so a calendar-month filter would empty those tabs. Option Expiry Date stays one row
per leg. **Export View** downloads the rows on screen: the current search, observation tab, and Reveal window. **Export Workbook** downloads every ongoing product, ignoring those filters. Both wait until the quotes they include have finished loading.

**Post Observation Analytics** is the next section on `/`. It lists live-maturity products whose every option expiry is on or before today. After Product Code the next columns are Initial Price Per Debenture (the face value) and Contingent Coupon, shown as a percent. Expected columns sit before the matching unwind columns. Unwind Quote Amount is the Product Book quote for one debenture. Unwind Amount is that same quote times the debentures. Residual Tenure is the next column: tenor days minus the days already invested, as of the Asia/Kolkata date. After that come the NBFC MIS cards and the NBFC book-value rupees, then Difference: Total Debentures in Issue, Amount with NBFC Percent, NBFC Grown Value Percent, Premium Credited Percent, Premium Grown Value Percent, Current Premium Outflow Percent, Total Funds For Margin, Amount with NBFC Rupees, NBFC Grown Value Rupees, Premium Credited, Premium Grown Value Rupees, Premium Outflow, Difference. Margin Cost is not a column here. Expected Maturity Quote is face value times one plus the contingent coupon. Expected Amount is that quote times the number of debentures. Difference is Unwind Amount minus Expected Amount. The rows are whoever has every option expiry on or before the Asia/Kolkata date, and that set moves when the date moves. Amount with NBFC Rupees is mobilisation after inbuilt, transaction, issuance, and margin costs, minus the margin funds. NBFC Grown Value Rupees grows that amount at the product discount rate and grows the margin funds at the margin funding rate.

The Product Book observation row has a Premium Outflow card before Reveal. It sums Premium Outflow Amount on option legs whose expiry falls inside the start and end dates, for the products on the current tab that match the observation mode. While those products price it reads
`Pricing k / n`; products with a passed observation are priced first, so the card settles in a few
batches. A failed quote batch is retried twice before it is left blank.

Every Download Excel workbook (Product Book, Unwinding Summary, Options Book, Pricer, Post Observation) stores rupees, rates, prices, quantities, and dates as Excel numbers and dates, and uses
dynamic column widths with **no cell indent / padding** on values.

Nav chrome: `nav-pill-shell`, animated `btn-nav-active`, `nav-sub-pill` for Portfolio
children.

## Home

Route `/`. Component `components/multi/multi-home-page.tsx`.

Intel hero and Desk Modules, plus the live **Product Book** (`MultiProductTable`) and
**Post Observation Analytics** (`PostObservationTable`) above the Desk Book.

1. Intel hero — title **Multiple Product Desk**, live badges (ongoing product count, surface label).
2. **Desk Snapshot** — four `SpecRail` cards only: Volatility Surface, **Reference Nifty
   Price**, **Reference Sensex Price**, **Products Loaded**. **Products Loaded** is the
   ongoing book: unique Product Code and **Maturity Date** on or after the Asia/Kolkata
   as-of. As of 2026-10-17 that is **2,207**. The full unique book is **2,505**; expired
   names appear only under Desk Book → Expired. The count is recomputed on each load and
   again when the IST date changes, including while the desk stays open. There is no Expiries Tracked
   card on this page (that count remains on Logic Atlas and Surface
   Parameters). Forward Sell Rate is intentionally absent.
3. **Product Book** — searchable table with **Export View** and **Export Workbook** on the
   search row, then observation tabs **Ongoing**, Observation in 3 / 2 / 1 Month (same
   remaining-expiry slot logic as Desk Book Product Master, but **without** the Expired tab).
   Only products whose **Maturity
   Date** is on or after the Asia/Kolkata as-of day appear here and in the multi Unwinding /
   Pricer product pickers (matured names are dropped dynamically). Desk Book alone lists
   Expired products. Columns: Sr. No., Product Name,
   Product Code, Unwind Quote Amount, Date As Of Today, three Internal Rates of Return,
   then Product Facts through Residual Tenor, without a duplicate Contingent Level card. Those
   fact cells are the same formatter as the Unwinding Product Facts tab (`product-facts.ts`).
   Unwind Quote Percent is not shown.
   Quotes load via batched `POST /api/multi/quotes` (server `computeUnwind`) with an
   `N / total` Products progress bar; the client only prices keys the server skipped.
   The Product Book table is **window-virtualized** (deferred quotes, visible rows only) so
   scrolling stays smooth on Vercel with thousands of ongoing products. The multi Desk Book
   and Post Observation tables use the same fixed-height window, so a long ladder does not
   force the whole product into the page at once. Every screen table uses the
   Product Master format: maroon and gold header, zebra rows, a line under each
   row, and a repeated value merged down the column (except the Volatility Surface grid, where every
   vol prints in its own cell). The header stays pinned while that window
   scrolls. Excel and PDF still store the number. Empty / blank master cells render as
   **`-`** (ASCII hyphen), including Payoff Formula.
4. **Desk Modules** — three tiles plus three sample downloads (Volatility Surface, Product
   Master, Product Master · Repeated Rows).
5. **Desk Book** — three-tab explorer (`DeskBookExplorer`).

### Desk Book tabs

| Tab | Contents |
|-----|----------|
| Product Master | Excel/upload keeps all **28** Main Master columns. The web desk shows **27** (`DESK_MASTER_HEADERS` — Contingent Level hidden because it equals Initial Underlying Level). The multi desk keeps a fixed row height so horizontal and vertical scroll stay aligned, and a repeated value is merged down that product. Product Master has **Ongoing**, **Observation in 3 Month**, **Observation in 2 Month**, and **Observation in 1 Month** tabs. The desk first drops products whose **Maturity Date** is before as-of. Ongoing is every remaining live-maturity product. The 1 / 2 / 3 Month tabs keep products that still have a 2nd / 3rd / 4th remaining unique Option Expiry Date after as-of. They do **not** drop Option Expiry Date rows — every remaining expiry for a product stays on the table. **Refresh** reloads the server book. Sticky Sr. No. / Product Name use **opaque** fills so horizontal scroll never bleeds through long names. |
| Volatility Surface | Strike Change (Deep · ₹500 then uploaded percents), then **Nifty Strikes**, **Sensex Strikes**, then **Expiry Date**, then one row per expiry. **Edit Volatility Surface** can change cells, add or remove expiry rows, and add or remove strike-percent columns. Deep stays ₹500. Save writes a plain surface (no Mongo `_id`) and Unwinding plus Pricer reprice from that book. Dates use `formatDeskDateFull`. Vols to two decimals, one cell per vol (repeated values down a column are not merged). Sticky first column. Dual scroll so nothing is clipped. |
| Surface Parameters | Sheet two: Surface Month, Expiries Tracked, Strike Columns, **Reference Nifty Price**, **Reference Sensex Price**, Volatility Bump, Forward Sell Rate, Deep Strike as SpecRail cards plus a full-width Parameter / Value table. Both reference prices, Volatility Bump and Forward Sell Rate are editable with the surface. |

#### Product Master header order (exact)

Excel / upload (`PRODUCT_MASTER_HEADERS`, 28 columns):

1. Product Name
2. Trade Date
3. Product Code
4. Mobilization Amount
5. Unwinds
6. Initial Underlying Level
7. Contingent Level
8. Allotment Date
9. Tenor Days
10. Maturity Date
11. Product Discount Rate
12. Premium Discount Rate
13. Payoff Formula
14. Contingent Coupon
15. Option Type
16. Strike Price
17. Spreads
18. Original Buy or Sell
19. Option Expiry Date
20. Required Quantity
21. Product Price
22. Reported Inbuilt
23. Transaction Cost
24. Issuance Cost
25. Margin Cost
26. Face Value
27. Total Funds For Margin
28. Margin Funding Rate

Web desk (`DESK_MASTER_HEADERS`, 27 columns): same order with **Contingent Level omitted**
(Allotment Date follows Initial Underlying Level).

SD Codes are **not** on this input table. They are engine-derived and hidden on both the
Pricer Table and the Options Book.

The explorer lives on Home only. Logic Atlas does not repeat Master Data · Workbook Explorer.
While `/api/dataset` is loading, a skeleton table pulses in gold.

## Unwinding Calculator

Route `/portfolio/unwinding`. Component `unwinding-page.tsx` plus shared
`UnwindInputPanel`.

### Input Parameters

Full-width glowing `input-desk-panel`. Same layout as Primary SP Product Details
([sp-dashboard-eta.vercel.app/portfolio/details](https://sp-dashboard-eta.vercel.app/portfolio/details)):
**one horizontal row per parameter** — gold uppercase label on the left, control filling the
right.

| Field | Notes |
|-------|-------|
| Product Name | Read-only |
| Product Code | Read-only |
| Underlying | Default from the product name or code: **Sensex** if Sensex / S&P BSE / BSE Sensex matches (substring, including glued names), otherwise **Nifty**. Bank Nifty stays Nifty. Options Nifty / Sensex. Pricing spot and vol moneyness follow the pick |
| Unwinding Date | Default **today**; min = allotment; max = today. Grown values and IRRs recompute |
| Bid Ask Spread | Percent suffix |
| Nifty Spot Level | Rupee suffix; **—** until Yahoo live or historical for that date |
| Sensex Spot Level | Rupee suffix; **—** until Yahoo; reference when Underlying is Nifty |
| Number of Debentures | **Last field.** Default is Total Debentures in Issue. Preset chips include the issued count |

Index · Prior Close / Today Close / Last Close badge + Refresh Index button. Empty numeric
fields show **—**. Changing the date clears spots and refetches. Today → `/api/market/levels`
(NSE desk rule below). Past date → `/api/market/index-at-date`. A missed Yahoo print stays
**—** and does not invent 22,800.

**Desk spot (as of today):** Yahoo daily closes for `^NSEI` / `^BSESN`, never the live
intra-day print while the cash market is open.

| NSE phase (IST) | Spot used |
|-----------------|-----------|
| Trading day, before/during 09:15–15:30 | Prior trading-day close |
| Trading day, after 15:30 | Today's close |
| Weekend / holiday / no today bar | Last available trading-day close |

Default Unwinding Date is the **Asia/Kolkata calendar day**, including on Vercel (UTC
hosts). Live `/api/market/levels` is `no-store` so the 15:30 IST flip is not held on a CDN
cache. Changing the date clears spots first, then refetches.

### Output

Gold dashed `RevealOutput` (“Click Here To View Unwinding Output”), then five tabs (no
unit words in tab names) that share the full width of the panel in equal columns; on a phone the strip scrolls. Expired settlement spots for that product come from one Yahoo
chart of the chosen underlying, so the reveal does not wait on a separate request per expiry:

1. Unwind Quote and Returns
2. Product Facts (includes Product Discounting Rate and Premium Discounting Rate)
3. NBFC MIS
4. NBFC Book Values
5. Options Book

While marks compute, the panel shows a serif title and a thin gold rule. There is no
spinner. Card inventories are listed in [doc 02](02-calculation-logic.md). Every section
uses `SpecRail` cards (equal columns, wrapping values, plain border, no gold top bar).

On the Multiple Product home, Product Book quote fills show a Dynamic Probability–style
progress bar with a live **loaded / total** count (for example `20 / 2,207 Products`).

**Download Excel** and **Download PDF** sit in the **bottom-right** of the revealed output
footer. Both use the Primary SP desk chrome: Anand Rathi logo, gold rule, maroon title band,
gold subtitle, parchment eyebrow, gold-bordered KPI tiles, maroon-header tables with ivory
zebra and hairline cell borders, plus the ARWL disclaimer and page footer. Filenames follow
`SP-Unwinding-Calculator-{code}-{DD-MMM-YYYY}.{ext}`. The PDF below the output is the
quote, facts, NBFC MIS and NBFC Book Values pages only. Options Book is **not** in that file.
Headers match the screen (full forms). Excel print area is the used range, one page wide.

Options Book table order (**11 columns**): Option Type, Strike Price, Number of Spreads,
Original Buy or Sell, Unwind Buy or Sell, Unwind Quantity, Option Expiry Date, Product
Premium Per Spread, Product Premium Amount, Unwind Option Price, Premium Outflow Amount.
Quantity Rounded is not shown on screen, Excel, or PDF. Current Option Price is omitted
because it duplicated the unsigned unwind mark. Product Premium Per Spread is the Product
Master Product Price. Unwind Option Price is the Pricer buy mark when the original side
is Sell, and the Pricer sell mark when the original side is Buy, shown without a minus.
An expired option shows its in-the-money price on the Options Book, never negative, and
that price is the same for Unwind Buy and Unwind Sell. A put is max(strike − spot, 0).
A call is max(spot − strike, 0). Original Sell pays that cash. Original Buy receives it,
so an in-the-money long prints a positive Premium Outflow Amount. The product Premium
Outflow is the sum of every leg amount. Pricer
Price/Sell/Buy stay **0** (Excel IFERROR). Each expired leg uses the index close
on/before **that leg's expiry date**. On screen, counted live marks and expired
intrinsic stay bold maroon. Expired out-of-the-money zeros stay faint. Desk pages keep titles and numbers only — no Options Book
Summary jargon cards and no long calculation paragraphs under the tables. SD Codes are
computed but not shown.
**Every leg is a full independent row. Consecutive identical values in a column merge
into one cell inside each strike group, on screen, in Excel and in the Options Book PDF
— **except** Option Expiry Date, Unwind Option Price and Premium Outflow Amount, which
always stay per-leg. Unwind Quantity matches Required Quantity scaled to the typed
holding. Premium Outflow Amount is the live Pricer mark, or the expired in-the-money
price, times that Unwind Quantity. The product Premium Outflow equals the sum of those
amounts. Product
Premium Amount stays on master Required Quantity.
**Download Options Book PDF** sits on the **extreme top-right**
of the Options Book header row (title left, button flush right; no wrap under the copy).

## Pricer Table

A tab on the Unwinding Calculator (`/portfolio/unwinding?tab=pricer`); the separate Pricer page
was removed. It uses the Unwinding Calculator's input panel, including the
selected **Underlying**. Nifty or Sensex chosen on Unwinding is the Pricer default (shared
desk inputs, kept in session storage). While the book computes, the panel shows a
serif title and a thin gold rule — no spinner. Reveal, then the **14-column** table
documented in [doc 03](03-pricer-logic.md): Strike Price through Option Delta. **Option
Code is not a column.** One row per leg. Strike / spot / rates / bump / spread may merge
inside a strike group; **Option Expiry Date, Implied Volatility, Mid/Sell/Buy Price and
Option Delta never merge**, even when rounded values match (e.g. 22,880 Aug vs Nov).
Option Delta shows six decimals. Downloads below the table.

## Logic Atlas

Route `/intelligence`. Matches the Primary SP Intelligence layout
([sp-dashboard-eta.vercel.app/intelligence](https://sp-dashboard-eta.vercel.app/intelligence)).

| Block | Contents |
|-------|----------|
| Hero | Kicker `Anand Rathi Wealth · Desk Intelligence`, title **Intel · Logic Atlas**, pipeline-count badge, product code |
| Headline SpecRail | Logic Modules, Pipeline Stages, Active Product, Option Legs |
| Master Data · Workbook Explorer | **Removed from Logic Atlas** — same explorer stays on Home |
| Reference Logic Modules | 46rem cards in one row with a visible horizontal scrollbar, Connected badge, metrics |
| Active Pipeline | Wide Primary-SP-style flow cards with kind, title and a two-to-three sentence description. Cards size to their copy (`min-w` 300px, `max-w` 440px), not equal height |
| Unwinding Desk Command | Three equal-width lanes filling the row: Unwinding Calculator, Pricer Table, Upload Desk |
| Computation Primitives | Full-width table of interpolation, Black–Scholes, FV, IRR, and related blocks |

### Nine logic modules

The Active Management layer adds Observations and targets, Current and expected rates, and
Scenario grid after the six below, and an Active Management lane; see
[11](11-active-management.md).

Each pipeline is complete (no orphaned nodes). Node kinds: `input`, `process`, `engine`,
`lookup`, `output`.

| Module | Role | Pipeline (in order) |
|--------|------|---------------------|
| Unwind Quote | Headline number | Date and spot → Grown NBFC holding → Grown credited premium → Today's option cost → Unwind Quote |
| Option marks | Option cost | Option legs → Live mark → Mark per leg → Book total → Option cost |
| NBFC holding | Cash grown | Amount raised and costs → Cash with the NBFC → Grown holding → Grown credited premium → Book unwind value |
| Option prices | Live prices | Spot, strike and expiry → Vol from the surface → Forward and discount → Price the option → Mid, sell and buy |
| Three rates of return | Yields | Quote and day counts → Product rate → Client rate → Residual rate → Three rates |
| Two uploads | Source files | Vol surface → Product master → Check the file → Saved desk → Live desk |

## Upload

Route `/upload`. Component `components/multi/multi-upload-page.tsx`.

1. Sample download buttons (Volatility Surface, Product Master · Multiple Products, and
   Product Master · Multiple Products · Repeated Rows). Clicking one saves the `.xlsx`
   workbook — they are download links, not nested buttons.
2. Two click-or-drag dropzones (keyboard accessible, drag-over highlight).
3. No login. Dropping a file uploads immediately.
4. Surface Month dropdown: **current calendar month and year only** (one option), calendar
   icon + chevron, not free text.
5. After upload, a popup confirms the file or lists schema issues. The popup is an
   independent page overlay. Home Desk Book and both calculators reread the active book.

Uploads: [doc 04](04-input-files.md).

## Design tokens

| Token | Value |
|-------|-------|
| `--ar-gold` | `#d4b24c` |
| `--ar-maroon` | `#7a1e2c` |
| Headings | Serif Times New Roman stack |
| Primary button | Gold gradient `btn-primary` + shine + motion |
| Accent button | White, maroon outline `btn-accent` |
| Ghost button | Light border `btn-ghost` |
| Inputs | `input-glow` with gold focus ring |
| Input panel | `input-desk-panel` full-width glow; Primary SP `FieldStack` one row per parameter |
| Tables | `data-table-premium` matching Primary SP: cream/gold header gradient, maroon uppercase labels, gold underline, zebra rows, pinned first column, `.desk-table-scroll` dual scroll. Sample input Excels keep tables plain: no fills, bold dark headers, thin gray borders. |
| Cards | `spec-rail-card` gold top bar, gradient value text, nowrap H-scroll rail |
| Hero | `intel-hero` with gold and maroon orbs |

## Site footer

Every `AppPage` ends with `DeskFooter` (`components/layout/desk-footer.tsx`), matching
Primary SP:

- Left: Anand Rathi Wealth · Active Management Dashboard, option-leg count (the
  full multi book), live desk clock (`en-IN`).
- Right italic status: loading copy, or active product / product count and surface label.

## Shared chrome components

| Component | File | Use |
|-----------|------|-----|
| `SpecRail` | `components/layout/app-ui.tsx` | Equal-height labelled value cards |
| `FieldStack` / `FieldRow` | same | One full-width row per parameter, label left / control right |
| `Panel` | same | Section surface |
| `SubPageTabs` | same | Title Case tabs |
| `DeskFooter` | `components/layout/desk-footer.tsx` | Brand, legs, clock, active-book status |
| `HorizontalBand` / `RailCard` | `components/layout/horizontal-rail.tsx` | Home modules, Atlas rails |
| `RevealOutput` | `components/ui/reveal-output.tsx` | Gold dashed reveal control |
| `DeskBookExplorer` | `components/dashboard/desk-book-explorer.tsx` | Home + Atlas book preview |

## Copy rules (do not regress)

1. Full forms: Volatility, not Vol. Internal Rate of Return, not IRR, in user-facing
   chrome (docs may use IRR as a short label in engineer tables).
2. Title Case on buttons, tabs and card labels. Not shouty small-caps.
3. No brackets in user-facing strings.
4. No unit words in tab names (not “Whole Book Rupee Values”).
5. Number of Debentures has no “Nos” suffix. Spots show a rupee suffix.
6. Two decimal places on displayed numbers.
7. Forward Sell Rate does not appear on the Home Desk Snapshot.
8. Desk Book Product Master: Excel samples have all 28 input columns; the web desk shows
   27 (Contingent Level hidden). Multi merges stay inside each product
   (never a shortened leg-only snapshot).
9. Home Desk Snapshot does **not** show Expiries Tracked. That
   card is only on Surface Parameters, where it is the Volatility Surface expiry-row count.
