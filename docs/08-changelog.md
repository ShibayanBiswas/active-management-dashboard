# 08 — Change log

Newest first. Each entry lists what changed, why, and where. Historical notes are left as
they were written on that day (a later entry may restyle something an earlier entry
introduced).

## 2026-11-09 — Active Management layer on the twin

- Product Book gains eleven columns (Current and Expected Internal Rate of Return, Actual and
  Effective Target, Observations Passed and Left, Observation Start, End and Next Date,
  Average So Far, Observation Status), the No Observation Passed and At Least One Observation
  Passed tabs, and Assumed Nifty and Sensex Level inputs.
- Unwinding Calculator gains the Active Management, Black Scholes Pricer and Scenario Grid
  tabs, each with Excel and PDF.
- `POST /api/multi/quotes` returns an `am` block per product and takes `assumed`.
- Actual Target is baked from the New Primary master (`npm run bake:am-targets`).
- `normalizeVolSurface` is memoised, which makes a whole-book pass about 80 times faster with
  identical results.
- `verify:am` is added to `npm run verify` and CI. Logic Atlas gains three modules and an
  Active Management lane.
- Details: [11](11-active-management.md).

## 2026-11-09 — Active Management Dashboard: twin of the Multiple Product Version

- This repository now carries the Unwinding Calculator (commit `764b138`) Multiple Product
  Version as the Active Management Dashboard. `/multi`, `/multi/portfolio/unwinding`,
  `/multi/portfolio/pricer`, `/multi/intelligence` and `/multi/upload` moved to `/`,
  `/portfolio/unwinding`, `/portfolio/pricer`, `/intelligence` and `/upload`.
- The Single Product Version is gone: its home and upload pages, the version pills, the
  `DatasetProvider`, `/api/dataset`, `/api/product`, `/api/unwind`, `/api/pricer`,
  `/api/uploads/product-master`, the `product_masters` collection and `verify:desk-edit`.
  `MultiDatasetProvider` now wraps the root layout.
- Branding reads Active Management Dashboard in the header, footer, tab title and export
  chrome. The Unwinding Calculator page and its export keep their name.
- Port 3006, database `active_management`, Vercel project `active-management-dashboard`.
  SP Workstation navigation (`active-management:navigate`) is checked by `verify:embed`.
- Engine, table columns, cards, tabs and exports are unchanged; the 961 golden fixtures stay
  for the engine verify scripts.

## 2026-10-22 — Nothing hardcoded in pricing, anchors or uploads

- An option expiring today settles on the last completed close: the prior close while NSE is
  open, today's close after 15:30 IST (the desk-spot rule). Ranges that reach today are not
  cached, so the close updates once the session ends. Yahoo's live intraday print is never a close.
- Observation tabs no longer list an option on its expiry day as remaining; the quote already
  settles it as expired.
- Default surface month, the 100% Nifty / Sensex anchors and the fallback Forward Sell Rate are
  read from the vol seed, so `npm run bake:vol` moves all of them. The hardcoded stale-reference
  override is gone; a surface without its own anchors takes its month's Yahoo close on or before
  the 1st.
- Product Master parsers no longer fill blanks with product 961's values (17,600 level, 1,875
  days, ₹1,25,000 face, 8.85 / 0.25 / 0.13% costs, 7% forward). A desk upload with a blank
  valuation fact is rejected with the product and cell named; a blank tenor is the allotment to
  maturity span. Across all 2,522 products in the FY masters no required fact is blank.
- The unused lot-of-75 rounding is removed. Logic Atlas counts come from the open book and its
  expired-option rule matches the engine. The desk clock shows IST, and the single desk opens
  on today instead of a date saved on an earlier day.

## 2026-10-22 — Premium Outflow card loads; Options Book and tabs restored

- The Product Book Premium Outflow card waited for all 2,195 quotes (about 50 seconds on Vercel)
  and stayed on "…" for good if a quote batch failed. Products with a passed observation now price
  first, a failed batch retries twice, and the card shows `Pricing k / n` until it settles.
- Options Book merges shared cells inside each strike group again and keeps every expiry's
  priced cells on its own row (the 17 Oct table change had merged every column). An expired
  row fades its Option Type too.
- Unwinding tabs (and every sub-page tab strip) fill the full width again.

## 2026-10-22 — October 2026 Volatility Surface

- The desk surface is the October 2026 grid from `Vol Surface for Oct26.xlsx`: 14 expiries
  (27-Oct-2026 → 26-Mar-2031) × 20 Strike Change percents. Deep · ₹500 takes the 55% vols on
  every expiry. Forward Sell Rate 6.60% and Volatility Bump 0 carry over; the 100% anchors are
  the 1 Oct 2026 closes, Nifty 22,421.95 and Sensex 71,909.70.
- Written to `lib/data` and `public/data` seeds, `Vol_Surface_Input_October.xlsx` (the September
  sample is gone), and Atlas `vol_surfaces` (`monthKey` `2026-10`, active).
- `npm run bake:vol -- "<surface.xlsx>" <YYYY-MM>` bakes any month's grid (replaces the
  September-only bake). `npm run build:samples -- --vol-only` rebuilds just the vol sample.
- The Volatility Surface grid no longer merges repeated values down a column.
- Golden parity and pricer locks stay on the frozen September surface
  (`lib/data/vol-surface-golden-sep-2026.json`). On the October seed the golden first leg is
  523.39 and the headline quote about 148.84%. `verify:aug-expiries` became `verify:vol-expiries`.

## 2026-10-22 — Multi book survives cold starts; tidy scripts and docs

- A desk upload or edit on the multiple-product book now loads from Atlas on a cold lambda.
  The book meta records the deployment seed it was written on (`baseSeedFingerprint`); only
  an Atlas copy from an older seed loses to the shipped seed. A single-product edit on a cold
  lambda merges into the full book instead of replacing it with one product.
- A Yahoo miss is no longer cached for the life of a lambda (expiry closes and the month's
  100% anchors retry on the next request).
- Residual margin add-on uses the clamped residual tenor, so it never turns negative after maturity.
- `/api/pricer`, `/api/market/index-at-date`, `/api/market/expiry-spots` and `/api/multi/quotes`
  return JSON 400 / 502 instead of an unhandled 500. Uploads over Vercel's 4.5 MB body limit
  show a clear message.
- Export "Generated" stamps and file names use the India calendar day.
- ESLint ignores `.next/`. Fourteen one-off audit and import scripts left the repo
  (`audit:final` / `audit:codebase` with them); `npm run verify:mongo` checks Atlas.
  `DEFAULT_VOL_MONTH` left `.env.example`; the app never read it.

## 2026-10-17 — Every table uses the single-product Product Master format

Screen tables share that master's header, zebra rows, row borders, and merged repeated values. A long book still scrolls a window of rows, and the maroon and gold header stays pinned. Excel and PDF still store the number in every cell.

## 2026-10-17 — A repeated cell value is shown once

Every screen table left a cell blank when it matched the cell above. The same day's Product Master pass replaced that blank with a merged cell, which is what the screen shows now. Downloads kept the number in every cell.

## 2026-10-17 — Living notes match the 17 Oct desk

The open Product Book is 2,207 products. Nifty Accelerator 1567 at 17 Aug 2026 and spot 24,366 is ₹1,33,905.27 on its 42-leg book. Discount Yield on the seed forward of 6.60% is 7.60%. The 684.61 fixture is the September seed file. The open desk carries that grid under the current month.

## 2026-10-17 — Tables scroll a window of fixed-height rows

Product Book, Post Observation, and the multi Desk Book move the visible window a band at a time. A long ladder is no longer pulled in whole, and the multi Desk Book does not use `rowSpan`, so the scroll position stays on the row under the pointer. A book of 80 option rows or fewer still shows every matched product.

## 2026-10-17 — Repeated option rows stay, and a mis-filed ladder stays with its name

A repeated Excel option row stays in the master when its price, spread, or quantity differs. An exact clone of the same row still drops. Nifty Accelerator 671 keeps all 192 rows (48 positions, four prices each). Nifty Accelerator 814 keeps its own eight strikes across four expiries; those rows had been grouped onto 787 because the code cell after the first row carried 787's series. While a product name continues, the code stays the code on the first row of that name.

Option expiries take Observation Average 1–7 whenever the Excel schedule and the observation list have the same number of dates, in date order. Nifty Magnifier 612 strikes are 22509, 21960, 19764, 15555, 15189, and 12810. Nifty Accelerator 709 is not on the New Primary sheet; its three expiries now sit on 30 Mar 2026, 30 Jun 2026, and 29 Sep 2026, the same dates as Accelerator 706, which has the same strikes. The book is 2,505 products and 79,190 live legs.

The single-product unwind view loads expired settlement spots from one Yahoo chart for that underlying. The click still reveals the output; the marks are no longer one request per expiry.

## 2026-10-12 — Dates stay on the India calendar, and a fractional issue still multiplies back

A vol upload with no month, and a blank surface month, use the Asia/Kolkata month. The unwind date field keeps the calendar day written on the product. A debenture count that is not a whole number is shown with enough decimals that it still multiplies back to Expected Amount.

## 2026-10-12 — Contingent Coupon is a percent on the screen

The Post Observation coupon cell shows the ratio as a percent, the same way the Excel download does. A coupon of 1.02 reads 102.00%.

## 2026-10-12 — Initial price and coupon sit beside the product code

Post Observation shows Initial Price Per Debenture and Contingent Coupon immediately after Product Code. The price is the face value. The Excel download uses the same two columns, with the price as rupees and the coupon as a percent. Grown values still compound from the allotment date to the unwinding date. That is the Excel future-value period, valuation date minus allotment, divided by 365.

## 2026-10-11 — Post Observation no longer totals Difference

The sum shown beside Export Excel is gone. Each row still has its own Difference, which is Unwind Amount minus Expected Amount.

## 2026-10-11 — Debenture count keeps a fraction when face value does not divide the issue

Three post-observation books do not have a whole number of debentures. The count is shown with the fraction, so it still multiplies back to Expected Amount. Whole issues stay as integers.

## 2026-10-11 — Premium Credited checked against the eight FY files

Premium Credited stays the absolute value of Product Price times negative Required Quantity on every live leg. Blank, zero, and plus-minus placeholder quantities stay out. 2,472 of 2,521 Excel products match that cell. The other 49 are repeated option rows the master keeps once. `docs/10-master-tally.md` records the count.

## 2026-10-11 — Premium Credited is the option-leg sum

Premium Credited is the absolute value of Product Price times negative Required Quantity on every live leg. A stored Premium Credited cell no longer overrides that sum. Blank, zero, and plus or minus placeholder quantities stay out of the book.

## 2026-10-11 — Post Observation uses the Product Book unwind quote

The unwind quote and the unwind amount are the Product Book figures again. Difference is Unwind Amount minus Expected Amount. Residual Tenure is the days left in the tenor as of today. Nifty Accelerator 671 is not on the New Primary sheet. Its contingent coupon is 102 percent and its tenor is 1,855 days, matching the Apr'21–Mar'22 Excel file, from allotment on 27 Oct 2021 to maturity on 25 Nov 2026. On 11 Oct 2026, 45 days remain. The Product Book unwind quote is ₹3,06,365.35 against an expected maturity quote of ₹4,04,000, so the difference on the issue is ₹−7,12,73,294.09. Premium Outflow is zero. The premium credited was only 11.97 percent of mobilisation, and the two grown pots stop at about 153 percent of the money raised.

## 2026-10-11 — Unwind quote stays on the maturity quote when options finish worthless

- On Post Observation, the unwind quote drops below the expected maturity quote only by the Premium Outflow of in-the-money options. A zero outflow no longer leaves a funding residual as a loss. A book that has grown past the coupon cap still shows that higher quote. The product list is whoever has every option expiry on or before today's Asia/Kolkata date.

## 2026-10-11 — NBFC PnL stays Unwind Amount minus Expected Amount

- Expected Maturity Quote is the maximum value of one debenture today: face value times one plus the contingent coupon. Expected Amount is that quote times the number of debentures. NBFC PnL is Unwind Amount minus Expected Amount.
- The 3 Nov 2022 to 24 Jun 2025 Premium Outflow card is ₹0.00 on the ongoing book because the only 12 legs in that window are out of the money. The same dates on matured products are ₹−4.90 crore and sit on the Expired tab. 1–20 September has no option expiry; the figure near ₹150 crore is the 29 Sep 2026 expiry.

## 2026-10-10 — NBFC PnL is measured against the money raised

- NBFC PnL is Unwind Amount minus Net Mobilisation. The contingent coupon remains the maximum maturity redemption in Expected Amount. It is not a cheque the NBFC already owes, so the column no longer treats a miss of that cap as a loss.
- Total Funds For Margin sits immediately before Amount with NBFC Rupees. Margin Cost is not a Post Observation column.

## 2026-10-10 — Post Observation columns follow the NBFC cards

- After Unwind Amount the columns are the NBFC MIS cards, then the rupee book values, then NBFC PnL. Margin Cost and Total Funds For Margin stay inside Amount with NBFC and the grown-value calculation. They are not columns on this table.
- NBFC Grown Value Rupees grows the amount with the NBFC at the product discount rate and grows the margin funds at the margin funding rate.
- The eight series whose New Primary product number differs from the Excel name now use the New Primary listed name. Option expiries are unchanged.
- `docs/10-master-tally.md` records the code, face, formula, name, and expiry tally of the eight FY workbooks, the New Primary sheet, and the unwinding master.

## 2026-10-06 — Excel XLSM parity and verify locks match the live desk

- XLSM Calculator replay freezes each leg's expiry to the date that was on the reference Options Book, so New Primary observation dates on the live seed do not break the Excel MarketData check.
- Desk marks stay ROUND to two decimals against that workbook. The quote gap versus the XLSM is still the fourteen deep-OTM legs that Excel left at zero.
- Verify locks accept the current desk month on the carried vol surface (October 2026 today, Nifty 22,421.95 / Sensex 71,909.70 at the 100% anchors). Production golden 21-Feb-2025 / spot 22,800 is replayed on the surface production returns, not a frozen September print.
- Full ongoing book stays clean: 2,217 products, 72,865 legs, bugCount 0. All eight reference FY XLSM files still map into the seed. `npm run verify` is 0 FAIL.

## 2026-10-10 — Names, payoffs, numeric downloads, post observation

- Product codes stay the series codes from the eight FY Excel masters. Option expiry dates stay on the New Primary observation calendar.
- A product name is replaced from the New Primary listed name only when the series matches and the product number is the same. A different product number on that series is left as the Excel name.
- Payoff text is copied from the Swap Product master. Every product on the book now has a formula.
- Download Excel stores rupees, rates, prices, quantities, and dates as Excel numbers and dates, including the Product Book.
- Post Observation Analytics lists ongoing products whose every option expiry has passed. Expected columns come before unwind columns. NBFC PnL is Unwind Amount minus Expected Amount. The Product Book observation row sums Premium Outflow for expiries inside the chosen dates. Names follow the New Primary listed name for the matched series.

## 2026-10-06 — Excel Main Master economics matched at full issue size

- Single sample XLSM Main Master rupee columns (Premium Outflow, Unwind Value, Book Unwind Quote) are whole-issue. The Calculator holding on that file is 800; the cross-check now replays at issued count 1,913 so those columns line up.
- Golden Calculator / XLSM MarketData marks, multi FY Apr'25–Mar'26 sample economics, full ongoing book (2,217 / 72,865), and edge suite all stayed clean on the same day.

## 2026-10-06 — Expired puts checked against the opposite unwind side

- Full ongoing book: 2,217 products and 72,865 legs. Desk spots are the 5 Oct 2026 Yahoo closes (Nifty 22,555.75, Sensex 72,382.47) because 6 Oct had not opened. Each expired leg still uses the Yahoo close on its own expiry.
- Unwind is the opposite of the original side on every leg. Original Sell unwinds as Buy. Original Buy unwinds as Sell. Zero exceptions on the re-run.
- Of 7,671 expired puts, 211 finished in the money as an original sell (unwind buy) and the cash is negative. 141 finished in the money as an original buy (unwind sell) and the cash is positive. 7,319 were out of the money and priced at 0. A put price is max(strike − spot, 0) and does not change with the side. Where the same strike and expiry appears on both sides, the price matches (0 mismatches).
- 42 expired calls use max(spot − strike, 0). Net Premium Outflow is the sum of every leg's Premium Outflow Amount on every product (0 card-vs-book mismatches).
- Re-audit and edge suite on the same day stayed clean: bugCount 0, ALL_PRODUCTS_LOG_CLEAN.

## 2026-10-05 — Net Premium Outflow is the sum of the option legs

- An expired option has one in-the-money price whether the unwind action is Buy or Sell. A put is max(strike − spot, 0). A call is max(spot − strike, 0). The spot is the Yahoo close on or before that expiry. The price is never negative.
- Premium Outflow Amount on each leg is that price, or the live Pricer mark, times the Unwind Quantity shown on the row. A sell is cash out. A buy is cash in.
- The product Premium Outflow card is the sum of those amounts. It no longer uses a second quantity (unscaled Required Quantity, or a lot-rounded quantity) that made the card disagree with the Options Book.
- On the 5 Oct 2026 book, before this change, 151 of 2,218 ongoing products had a card that was not the leg sum. Nifty Accelerator 706 was off by ₹1,82,280.71.

## 2026-10-05 — Every expired leg uses that expiry's Yahoo close

- The close is the Yahoo bar whose India date is on or before the option expiry, looked up to three weeks back so a holiday week still resolves. The next session is not used.
- When the desk has asked for those closes, a missing date stops the quote. Today's Nifty or Sensex is not written onto an old expiry.
- Live legs still take the Pricer buy price when the unwind is a buy, and the Pricer sell price when the unwind is a sell.
- Checked on 5 Oct 2026 across 2,218 ongoing products: 7,731 expired legs and 65,152 open legs. Expired prices matched the strike difference at that date's close. Open prices matched the Pricer. In-the-money buys were cash in, in-the-money sells were cash out, and out-of-the-money expired legs were zero.

## 2026-10-05 — Expired bought options that finish in the money pay in

- An expired option settles at intrinsic using the Yahoo close on or before that leg's expiry. Put is max(strike − spot, 0). Call is max(spot − strike, 0).
- Original Sell still pays that cash. Original Buy now receives it, so the Options Book outflow for an in-the-money long is positive and it enters Premium Outflow, Unwind Value, and the headline quote.
- The Pricer table stays 0 after expiry. Out-of-the-money expired options stay 0.
- Calculation notes, the smoke list, and the verify suites use the same rule.

## 2026-10-03 — Current month name, and Product Name merged

- A September vol grid shown in October is labeled October, and the reference prices are the 1 October closes. The vol numbers stay the previous month until an October file is uploaded.
- Product Name and Sr. No. club into one cell for each product. Those merged cells are not pinned, so scrolling stays intact.

## 2026-10-03 — Observation start, full option columns, carried vol month

- Observation Date starts at the oldest option expiry on the ongoing book. The end date stays today.
- Product Book now ends with the full Options Book, in that column order.
- If this month has no Volatility Surface, Single and Multiple keep the previous month's name and reference prices. An uploaded surface for the current month replaces them.

## 2026-10-03 — Product Book scroll stays intact

- Each option leg row is a fixed 41px, matching the scroll window, so a long book does not drift into blank space.
- Sr. No. and Product Name stay one cell per row and stay pinned. The other shared facts still club. Pinning a merged cell was what broke the table while scrolling.

## 2026-10-05 — Product Book rows use the Desk Book background

- Product Book rows use the same white and warm zebra, the same hover, and the same cell padding as the Desk Book. The separate fixed-height row box is gone.

## 2026-10-05 — Product Book rows are plain

- Product Book rows use the same plain paper colour as the Desk Book base row. No cream stripe and no gold hover.

## 2026-10-05 — Product Book text shading restored

- Quote, rate, and counted outflow figures are bold maroon again. Facts stay medium weight. Expired display-only marks stay faint. The selected product keeps its shade.
- Gold zebra stripes, gold hover, and a line on every leg row stay off. One line remains at the end of each product.

## 2026-10-05 — Product Book text shading restored

- Quote, rate, and counted outflow figures are maroon and bold again, as they were before the plain-row edits.
- Clicking a product does not paint a gold row. Hover stays plain white. A line appears only at the end of each product.

## 2026-10-05 — Product Book is a plain grid with one rule per product

- Product Book rows use the same white desk background, with no gold stripe and no gold hover.
- A horizontal line sits only on the last row of each product. Leg rows inside a product have no line.

## 2026-10-04 — Product Book rows do not turn gold on hover

- Hovering a Product Book row keeps the row’s own colour. The gold wash stays on the other desk tables.

## 2026-10-04 — Product Book Export View and Export Workbook

- Export View downloads the rows on screen: search, observation tab, and the Reveal window.
- Export Workbook downloads every ongoing product and ignores those filters.
- Both files use the same 33-column Product Book layout.

## 2026-10-03 — Month rollover stays on the India calendar

- Each new month, if that month has no volatility upload, the previous grid continues under the new month name and the Nifty and Sensex anchors move to the Yahoo close on the 1st. November, December, and later years use the same path.
- Sample Volatility Surface downloads stay on the seeded September workbook. The live book name is separate, so the link does not point at a missing October file.

## 2026-10-03 — Product Book scroll grid and current-month surface name

- The Product Book screen no longer uses rowspan. Every leg row has every column, so a scroll cannot slide Option Expiry Date under Product Name. The product name shows on the first row of the product and again at the top of the scroll window.
- A carried vol surface is named for the current month, including its month key, and keeps the previous month's vol grid. Reference prices are that month's first session when Yahoo has them.

## 2026-10-03 — Shorter desk copy and multi Refresh

- Product Book no longer prints the column lecture. The heading and the row count are enough.
- Home lines, upload notes, and loading lines stay short and have no bracketed asides.
- Multiple Product Desk Book has Refresh on Product Master, Volatility Surface, and Surface Parameters. It reloads the live book and the expired extras.

## 2026-10-03 — Product Book observation filter, option columns, New Primary expiries

- Multiple Product Book gains the Primary / Secondary observation filter: Observation Date
  (First, Last, or Any), Start Date, End Date, and Reveal. Reveal keeps products whose option
  expiry dates fall in that window. The table stays unfiltered until Reveal.
- Product Book is one row per live option leg. Premium Outflow (NBFC Book Values rupee card)
  is the column after Client Internal Rate of Return. Option Expiry Date, Product Premium Per
  Spread, Product Premium Amount, Unwind Option Price, and Premium Outflow Amount follow the
  product facts, in Options Book order. Shared values club by product. Unwind Option Price and
  Premium Outflow Amount stay unmerged. Download Excel uses the same columns and merges.
- Option expiry dates on the multi book and on Nifty Accelerator 961 were rewritten from the
  Secondary New Primary sheet Observation Average 1–7, matched on series, product name, and
  rollover phase. Phase 2 updates only when the unwind name itself says Phase 2. A name with
  no phase is the original book and matches a blank or Phase I row. Equal-length schedules
  move only when every date shifts by at most two months, so a multi-year jump is left alone.
  Reference: Nifty Accelerator 706 is 30-Mar-2026, 30-Jun-2026, 29-Sep-2026. Nifty Accelerator
  961 first-leg price on the September surface is now **684.61** because its first expiry moved
  to 23-Feb-2027. Sample workbooks were rebuilt from those seeds.

## 2026-09-16 — Desk + expiry spots always Yahoo by date

- Live pipeline: Nifty/Sensex for the unwinding date and for every expired leg
  expiry come from Yahoo Finance (`resolveDeskSpots` / `resolveExpirySpots`). No
  hardcoded desk prints in audits, `/api/unwind` (default), or `/api/multi/quotes`.
- Golden Excel fixtures may still pin a historical spot with `useYahooSpots: false`.
- Vol-surface `MONTHLY_REFERENCE_*` remain strike-grid anchors from the monthly
  surface file (not live pricing spots).

## 2026-09-16 — Expired Sell-put uses spot at leg expiry (not desk spot)

- Options Book + Premium Outflow KPI: expired original Sell puts use put intrinsic
  max(strike − spot_at_expiry, 0) where spot_at_expiry is the index close on/before that
  leg's Option Expiry Date (Yahoo historical). Mar-26 vs Jun-26 at the same strike can
  differ when Nifty moved between those dates.
- `/api/market/expiry-spots`, `computeUnwindWithExpirySpots`, UI prefetch before client
  compute. Pricer Excel IFERROR → 0 unchanged.

## 2026-09-16 — Docs sync: Sell-put KPI + all-products logs + Vercel

- All `docs/*.md` + root README aligned: expired ITM Sell-put intrinsic enters Premium
  Outflow / Unwind Value / quote; Pricer stays Excel IFERROR → 0; same-strike expired
  expiries share intrinsic (not a bug); counted outflows bold.

## 2026-09-16 — Expired ITM Sell-put intrinsic enters Premium Outflow

- Options Book Sell-put intrinsic max(strike − spot, 0) now feeds Premium Outflow / Unwind Value / headline quote (Required Quantity path).
- Same strike + spot ⇒ same intrinsic across expired expiries (correct; no τ left). Pricer table unchanged (Excel IFERROR → 0).
- Counted Sell-put and live outflows are bold maroon; expired Buy/call zeros stay faint.

## 2026-09-14 — Live product picker harden

- Product Name combobox and selectProduct only accept Maturity Date ≥ IST today.

## 2026-09-10 — Remove Options Book Summary jargon cards

- Drop Live Legs Counted / Expired Legs Display Only / Display-Only Book Cash and the whole Options Book Summary rail.
- Options tab is the table only; faint vs bold marks stay.

## 2026-09-10 — Strip desk jargon; Pricer IFERROR stays 0

- Remove long muted explanation paragraphs from Unwinding, Options Book, Pricer and Input Parameters.
- Keep faint/bold Options Book marks for live vs expired without prose.
- Pricer expired and non-finite Black–Scholes paths match Excel IFERROR → 0 on Price/Sell/Buy and rates.

## 2026-09-10 — Options Book shows counted vs display-only outflows

- Live Unwind Option Price and Premium Outflow Amount stay bold maroon — those feed Premium Outflow on the NBFC Book.
- Expired rows are faint on those two columns; they stay on the Options Book only and do not enter the KPI.

## 2026-09-10 — Option marks and outflows are two decimal places end-to-end

- Pricer Price / Sell / Buy round to two decimals after Black–Scholes (`roundDeskMoney`), matching Excel currency cells.
- Options Book Unwind Option Price, Premium Outflow Amount, Product Premium Amount, and KPI premium outflow use those rounded marks.
- Deep OTM noise such as 0.000004 no longer prints as price 0.00 with a few paise of rupee outflow.
- Golden 961 lock refreshed to the rounded path: Unwind Quote Percent **147.178163%**, first-leg price **685.74**.

## 2026-09-10 — Docs: expired cash is Options Book display only

- Excel Main Master stores 0 after expiry. Premium Outflow KPI, Unwind Value, and the headline quote add 0 for expired legs.
- The Options Book **table** may show put intrinsic max(strike − spot, 0) on an expired original Sell put. That price and outflow are display-only.
- Negative headline quotes on a few ongoing products (2026-09-10 audit) had **0 expired legs** — live option cost only, not an expired-cash leak.
- Live Black–Scholes prices floor at 0. Ongoing book size as of 2026-09-10: **2,239** live / **2,505** full.

## 2026-09-10 — Black–Scholes live prices floor at zero

- Deep out-of-the-money numerical noise (~1e-13) no longer prints as a negative live option price on the Pricer.

## 2026-09-10 — Expired Sell put is put intrinsic, never negative

- Put payoff at expiry is max(strike − spot, 0). A put option price is never negative.
- The old Options Book mark `spot − strike` flipped ITM puts negative and invented value on OTM puts. The desk now shows put intrinsic on expired original Sell puts only.
- That row cash is Options Book **table display only** and is not added into Unwind Value or the headline quote. Buy puts and calls stay 0. Pricer stays 0.

## 2026-09-09 — Ongoing versus expired rolls each IST day

- Product Book, Unwinding, and Pricer keep only Maturity Date on or after the Asia/Kolkata as-of. That split is computed on each load, not stored in Mongo.
- An open desk checks the date each minute and when the tab is focused, then moves newly matured names to Desk Book → Expired and reloads quotes for the new day.

## 2026-09-09 — Products Loaded is the ongoing book

- **Products Loaded** and the hero product badge count unique products whose Maturity Date is on or after today. As of 2026-09-09 that is 2,244. The full book is 2,505; expired names stay on Desk Book → Expired only.

## 2026-09-09 — Sample Excel downloads use fitted column widths

- Volatility Surface, Product Master 961, and both Multiple Product samples size each column to the header and the values, with date columns wide enough for `DD-MMM-YYYY`.
- Masthead banners and footer notes no longer stretch the first column.

## 2026-09-09 — GitHub Markdown preview cleanup

- Table cells no longer contain raw pipe characters, so GitHub does not split those rows.
- Numbered steps no longer continue as `4.` after a table.

## 2026-09-09 — Final docs lock for upload, download, and the exception

- The Mongo tally script closes its client after the seed comparison so the check exits.
- Download Excel is a screen export. An expired Sell put keeps the spot difference and a real rupee outflow. Premium Outflow, Unwind Value, and the headline quote do not add that cash.
- Upload and Mongo still replace the live book as a whole. Seeds stay the cold start when Atlas is unreachable.

## 2026-09-09 — Docs match the expired Sell-put exception

- Options Book: expired Sell put is the unwind-date spot minus strike, with that row outflow. Buy puts and calls stay 0. Pricer stays 0.
- That row cash is not added into Premium Outflow, Unwind Value, Book Unwind Per Debenture, or the headline quote. That is the Excel formula path.

## 2026-09-09 — Expired Sell put is live spot minus strike

- Excel's non-zero expired cells are typed as strike minus a fixed spot. That patch is
  not the rule.
- An expired original Sell put uses the unwind-date spot minus strike on the Options
  Book, with that row outflow. That cash is not added into Unwind Value, Book Unwind
  Per Debenture, or the headline quote. Expired buy options stay 0.
- Expired buy puts and calls stay 0.

## 2026-09-08 — Expired option prices follow the Excel Main Master

- Checked all eight masters. The formula stores 0 for an expired sell or buy, because
  the Pricer lookup errors. Outflow is that price times quantity and is added into the
  unwind value.
- A few old rows were typed as strike minus a fixed spot. Those are not the formula.
- The desk uses the formula path: expired price 0, outflow 0, and that 0 is what the
  quote adds.

## 2026-09-08 — Expired Sell put difference stays off the Unwind Quote

- An expired original Sell put shows signed spot minus strike, and Premium Outflow is that difference times quantity.
- Expired buy puts and calls stay 0.
- That difference is Options Book display only. It is not added into the Unwind Quote or the rupee unwind value.

## 2026-09-08 — Expired options price and outflow are 0

- Excel’s Pricer errors once the expiry has passed. The Main Master lookup stores 0 for
  sell and buy, puts and calls.
- The desk now does the same. An expired option is 0 on the Pricer and on the Options
  Book. Premium Outflow is 0, so that leg does not move the Unwind Quote.
- A book with no expired legs, including the 21-Feb-2025 golden quote, is unchanged.

## 2026-09-08 — Logic Atlas pipeline cards match the reference desks

- Active Pipeline nodes use the same 300–440px kind-coloured cards as Primary SP.
- Desk Command uses the same lane cards: colour dot, Data lane, Valuation, Payoff.
- Rate asides such as “not the product’s 7.50 percent rate” are off every card.

## 2026-09-08 — Logic Atlas cards match the reference desks

- Reference Logic Module cards are 46rem wide, the same rail as Primary SP, Secondary SP,
  and Dynamic Probability Calculator. Copy on the cards, pipeline, desk command, and
  building-block table is plain desk language — no formula dump on the card face.

## 2026-09-08 — Product Facts cards share one mapping

- Unwinding Product Facts, Excel, and PDF read the same computed result fields
  (`lib/workbook/product-facts.ts`). Initial Underlying Level is the unwind result, not a
  separate product lookup. Multi Product Book fact cells use the same master fields and
  formatters, still without a duplicate Contingent Level column.

## 2026-09-08 — Sample input tables have no colour

- Product Master and Volatility Surface sample workbooks: every cell inside the table
  (headers, strike rows, parameters, values) is uncolored. Bold dark labels and thin gray
  borders only. Logo and masthead stay above the grid.

## 2026-09-08 — Multi table scroll/load + Logic Atlas explorer removed

- Multiple Product home: quote flushes no longer re-render the Desk Book. Scroll windows
  update only when the visible row changes. Desk Book formats only the products on screen
  instead of flattening the full option matrix.
- Product / Client / Residual IRR stay the zero-coupon desk formulas (golden Product IRR
  14.44597%; Client / Residual locked in `verify:parity`).
- Logic Atlas drops **Master Data · Workbook Explorer** (already on Home). Hero counts use
  the full multi book when loaded.

## 2026-09-07 — Remove oversmart abs on expired Sell puts (display + engine)

- Engine stores expired Sell-put Unwind Option Price as raw signed `(spot − strike)` —
  **no** `Math.abs`, **no** `signedUnwindPrice` flip.
- Screen, Excel, and PDF show that signed value for expired puts; live/call marks stay
  unsigned for readability.
- Docs 02 / 03 / 06 / 07 / 08, README, Logic Atlas copy updated end to end.

## 2026-09-07 — Expired Sell put uses signed (spot − strike), not abs

- Options Book expired **Sell** puts: mark / Premium Outflow = `(spot − strike) × qty`
  (signed difference — no absolute value). **Buy** puts stay `0 × qty`.

## 2026-09-07 — Expired Sell-put |S−K|×qty; Buy-put 0; Multi hang harden

- Options Book expired **puts**: Original **Sell** Unwind Option Price / Premium Outflow use
  `(spot − strike) × quantity` (lot-rounded qty when expired). Original **Buy** puts are
  **0 × quantity**. Pricer mid/sell/buy stay exchange intrinsic (`max(K−S,0)`).
- Multiple Product: live book and matured extras stay in **separate** state (full-book
  merge no longer freezes Product Book). Quote pass merges results (no blank wipe) and
  never runs bulk `computeUnwind` on the UI thread.

## 2026-09-07 — Expired Pricer IV = 0; Unwind Quote no calculating flicker

- Expired / passed legs (`τ ≤ 0`, including expiries missing from the vol surface): Pricer
  Implied Volatility, Volatility Bump, Forward Growth, Discount Yield and Bid Offer are
  **0**; Price / Sell / Buy stay intrinsic settlement. No surface vol interpolation.
- Unwinding + Pricer: remove artificial 60ms/280ms computing timers (timer races caused
  repeated “Calculating…” flicker). Keep prior marks visible while quietly repricing;
  loader only on cold start. Stabilize compute deps on a primitive key.

## 2026-09-07 — Multi unwind local price + Excel date widths + Options Book qty×mark

- **Multi / single Unwinding + Pricer** price in the browser (`computeUnwind` /
  `priceProductBook`) so Vercel no longer receives multi-leg Product Master + full vol
  surface POSTs that timed out or crashed the unwind flow.
- `/api/unwind` and `/api/pricer` keep `maxDuration = 60` for any remaining server callers.
- Excel autofit: date columns floor at width **12** with padding so `dd-mmm-yy` never
  renders as `####` (screen downloads + sample input builders).
- Options Book **Premium Outflow Amount** uses holding-scaled Unwind Quantity
  (`qty × mark`; lot-round when expired). Product Premium Amount and Master KPI Premium
  Outflow stay on Required Quantity for Main Master / XLSM parity. (Later same-day entries
  supersede any interim abs / intrinsic display for expired Sell puts.)

## 2026-09-07 — Options Book PDF button extreme right

- **Download Options Book PDF** stays flush on the extreme right of the Options Book
  header (`ml-auto shrink-0`, no `flex-wrap` under the copy).

## 2026-09-07 — Options Book drops Quantity Rounded; UI jargon cleaned

- Options Book (screen, Excel, PDF): **11 columns** — remove **Quantity Rounded**. Lot
  rounding still applies inside premium outflow; it is not shown to the desk.
- Unwinding / Logic Atlas copy: drop parenthetical settlement jargon from the UI; keep
  short plain language for live marks. (Expired Sell-put signed `(S−K)` / Buy-put `0`
  clarified in later same-day entries.)
- Blank Buy/Sell + signed Req. Quantity mapping remains the trust-signed-qty path
  (`normalizeSideAndQty`); re-verified in multi-parse / XLSM economics gates.

## 2026-09-07 — Premium Credited always positive (desk strategy)

- `bookPremiumFraction` returns the **absolute** Main Master / option-book fraction so
  initial Premium Credited is never negative (Excel can store a signed cell on a few FY
  names). Premium Grown compounds from that positive amount.
- Multi parse stores `|Premium Credited| / Mobilization`. Seed + Mongo normalized.
- Edge cases cover negative stored fraction and sign-flipped legs; XLSM e2e compares
  magnitudes for Premium Credited / Prem Grown.

## 2026-09-07 — Premium Credited prefers Main Master + Multi hang harden

- `bookPremiumFraction` prefers stored Main Master **Premium Credited / Mobilization**
  (`premiumFraction`) before recomputing from legs.
- Parser: blank Buy/Sell trusts already-signed Req. Quantity (negative → Sell). Re-collated
  FY21–FY27 book → **2,505 products / 78,102 live legs** (was 77,679 under the old flip).
  ARG26SP17 Series I Premium Credited, Product Premium, and book Unwind Quote now match
  Main Master within gate tolerances (`e2e-xlsm-economics` PASS).
- Product Book quotes: batched `POST /api/multi/quotes` (keys required, max 64); local
  fallback only for missing keys; optional client `products` for post-upload marks.
- Dataset: live book first, `?scope=full` in background for Expired; upload spinner no
  longer waits on Multi refresh; Product Master warns when `persisted === false`.
- Product Book UI: deferred quotes + format visible rows only; Excel download errors shown.
- PricerRow exposes `expired`; docs 01–05 / 07 / 09 / README updated for the pipeline.

## 2026-09-07 — Initial Underlying Level

- Product Master / Desk Book / Product Book / Unwinding Product Facts / Excel+PDF exports:
  column **Initial Nifty Level** → **Initial Underlying Level** (Nifty or Sensex books).
- Parsers still accept legacy **Initial Nifty Level** headers from XLSM uploads.
- Internal JSON/Mongo field remains `initialNiftyLevel` for seed/API stability.
- Docs `02` / `04` / `06` / `07` / README updated for the rename.
- Locked September pricer goldens (`verify:pricer`, `verify:pricing`) to Forward Sell
  **6.60%** → discount yield **7.60%** and the matching mid/delta/vol rows.

## 2026-09-07 — NBFC MIS / Book Values cards, Product Book progress

### Unwinding Calculator cards (Single + Multiple)

- Tab **NBFC and Premium Growth** → **NBFC MIS** (percent book only).
- Tab **Whole Book Values** → **NBFC Book Values**.
- **Product Discounting Rate** (7.50%) and **Premium Discounting Rate** (5.10%) move into
  **Product Facts** (after Margin Cost, before dates).
- **NBFC Book Values** order: Amount with NBFC Rupees → **NBFC Grown Value Rupees** →
  Premium Credited → Premium Grown Value Rupees → Premium Outflow → Unwind Value →
  Book Unwind Per Debenture.
- Excel Summary + PDF sections / labels match the same names and order.

### Product Book progress

- Live quote fill shows a Dynamic Probability–style bar with **`N / total` Products**
  (`components/ui/quote-load-progress.tsx`, wired from `multi-desk-provider` loaded/total).

### Sensex

- Underlying regex includes `spsx` product-code fragments; edge cases + seed probe in audits.

### Docs

- Docs `02` / `06` updated for the new tab and card names.

## 2026-09-05 — Dynamic vol sample month

- Home / Upload / Multi sample tiles pass `surface.monthKey` into
  `volSurfaceSampleFileName` / `volSurfaceSampleLabel` so the download name tracks the live
  book month.
- Verify scripts updated to the September golden (`1.4717796201480349`); legacy ~146.93%
  expectations removed.

## 2026-09-05 — Excel autofit (no padding), Expired Desk Book tab, live-only Product Book

### Excel downloads (every screen export)

- Column widths are now **content-sized end-to-end** via `autofitExcelColumns` in
  `lib/workbook/export-theme.ts` (Product Book, Unwinding Summary, Options Book, Pricer).
- **No cell indent** on values, labels, KPI tiles, mastheads, or disclaimers.
- Full-width merged chrome (banner / section / disclaimer starting at column A) is ignored
  when sizing so legal text no longer caps every column at width 60.
- Mid-sheet value merges (Unwinding Summary key/value blocks) still size their master column.
- Sample builders (`scripts/build-sample-inputs.ts`) use the same no-padding autofit.
- `verify:downloads` asserts zero indent and dynamic (non-flat) widths on all four sheets.

### Expired products vs live book

- Desk Book observation tabs: **Ongoing · Observation in 3 / 2 / 1 Month · Expired**.
- **Expired** = Maturity Date before Asia/Kolkata as-of. Uses `multi.allProducts` so matured
  names remain visible and editable on Desk Book only.
- Product Book, Unwinding Calculator combobox, and Pricer picker use **live maturity only**
  (`LIVE_OBSERVATION_TAB_ORDER` / `multi.products`) — no expired products in those lists.
- Desk Book kicker counts the full book (`allProducts`); Product Book hero cards stay live.

### Expired put outflow (Options Book)

- Buy/Sell expired puts still settle `max(K−S, 0)` × lot-rounded Required Quantity.
- ITM buy puts show non-zero Premium Outflow; OTM correctly shows 0 (not a blank / bug).
- Locked in `verify:edge` (including Expired tab membership + live filter).

### Reference / Mongo tally

- Local + Mongo active surface: September 2026, 15 expiries, Forward Sell **6.60%**, Vol Bump
  **0**, Nifty **24,090.85**, Sensex **77,264.51** — matches
  `Vol_Surface_Input_August (2).xlsx` on matching live expiries (passed Jun/Jul/Aug dropped).
- Multi seed **2,505** / live **2,245** / expired **260**; all eight Downloads XLSM Main
  Masters ⊆ seed (0 missing ISINs). Mongo active vol + single product match seed; multi
  collection holds 2,505 active docs.

### Production smoke (unwinding-calculator.vercel.app)

- `/api/dataset` → month `2026-09`, 15 expiries, fwd `0.066`, nifty `24090.85`.
- September vol sample **200**; legacy August sample **404**.
- Vol upload pipeline regression (`verify-vol-upload-pipeline`) still passes.

## 2026-09-05 — September vol surface seed + current-month sample download

- Default Volatility Surface seed / Mongo active book is **September 2026** baked from
  `Vol_Surface_Input_August (2).xlsx`: **15** live expiries (passed Jun/Jul/Aug 2026 rows
  removed), Forward Sell Rate **6.60%**, Volatility Bump **0**, Reference Nifty
  **24,090.85** / Sensex **77,264.51** as of **1 Sep 2026**.
- Sample download renamed to `Vol_Surface_Input_September.xlsx` (no August filename). Home
  and Upload tiles use `volSurfaceSampleFileName()` / `volSurfaceSampleLabel()`.
- Upload refresh race fixed earlier: prefer `isActive` surface, multi `/api/multi/dataset`
  is `no-store`, Pricer/Unwind recompute on surface revision.
- Live Vercel: September sample downloads **200**, legacy August sample **404**. Vol /
  single / multi (2,505) uploads persist and Pricer Forward Growth is **6.60%**. The
  Repeated Rows sample downloads on production (`ensure-repeated-sample`); a full
  ~90 MB POST can hit the platform body limit — use the merged multi sample for live
  upload smoke tests.

## 2026-09-04 — Sample Excel logo + maroon/gold masthead

- All `public/samples/*.xlsx` downloads now embed the Anand Rathi logo and the same
  maroon/gold desk masthead used by Product Book / Unwinding / Pricer Excel exports.
- Multi samples (merged + repeated) were SheetJS-only with no branding; they are polished
  with ExcelJS after write. Vol Surface grid starts at column A so parsers stay stable.
- Upload/sample round-trip and vol-surface header detection hardened for branded rows.

## 2026-09-04 — Repeated Rows sample on Vercel + Desk Book merges

- Production returned **404** for `Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx`
  because the ~90MB file is gitignored. `npm run build` now runs
  `ensure-repeated-sample` so Vercel always ships that download.
- Desk Book per-product cell merges restored with merge-aware virtualization
  (`expandWindowToGroupBounds`). Alignment audit fixed to find product 1569 anywhere
  in the seed, not only the first five rows.

## 2026-09-04 — Desk Book merges restored with merge-aware virtualization

- Multi Product Master again merges identical column values **within each product**
  (`computeGroupedRowSpans` grouped on Sr. No.). Virtualization was briefly painting every
  cell and broke those merges.
- The virtual window now expands to whole-product bounds via `expandWindowToGroupBounds` so
  HTML `rowSpan` never cuts mid-product while scrolling stays light.
- Observation tab switches use `startTransition` + `useDeferredValue`; scroll resets on tab /
  search change. Bracketed Maturity Date copy removed from multi home.

## 2026-09-04 — Download Excel column contract + styled builders

- Shared export headers live in `lib/workbook/export-columns.ts` (Product Book 21,
  Options Book 12, Pricer 14) so UI tables and Excel/PDF stay aligned.
- Real workbook builders in `lib/workbook/build-screen-excel.ts` (maroon/gold masthead,
  disclaimer chrome). `verify:downloads` exercises those builders, live-maturity Product
  Book rows, ₹ / `-` blanks, and all eight Downloads XLSM files ⊆ seed.
- Blank premium cells use ASCII `-` (not em-dash). Currency on screen exports uses `₹`.

## 2026-09-04 — Product Book / Desk Book scroll latency

- Product Book and multi Desk Book Product Master use a fixed-row **virtual window** so
  only ~40 visible rows stay in the DOM (was ~2,245 × 21 cells / tens of thousands of
  option rows — that froze scrolling on Vercel).
- Multi quote fills throttle to ≤ ~5 React updates/sec via `startTransition` + idle yields.
- `/api/multi/dataset` returns **live-maturity products only** (plus `bookProductCount` /
  `liveProductCount`) so the gzipped payload and client parse stay smaller.

## 2026-09-04 — Ongoing desk = Maturity Date on or after today

- Multi Product Book, Desk Book observation tabs, Unwinding Calculator picker, and Pricer
  picker only list products whose **Maturity Date ≥ Asia/Kolkata as-of**. Matured names are
  excluded dynamically (~260 on the collated book as of 4 Sep 2026).
- Observation in 1 / 2 / 3 Month still require a 2nd / 3rd / 4th remaining option expiry
  among those live-maturity products. Ongoing keeps every live-maturity product (all option
  rows). Quotes price only the live book.

## 2026-09-04 — Desk blanks, client multi quotes, multi dataset fast-path

- Desk Book / Product Book empty cells show ASCII **`-`** via `deskBlank` (not a bare
  empty string or em-dash alone).
- Multiple Product home prices all 2,505 Unwind Quote Amounts in the browser after one
  `/api/market/levels` fetch (`MultiDeskProvider`), with progressive chunk updates.
  `POST /api/multi/quotes` remains for tools/exports.
- `/api/multi/dataset` uses a Mongo `book-meta` fingerprint: when Atlas still matches the
  collated seed, the lambda serves the deployment seed instead of pulling ~17 MB / 2,505
  docs on every cold start. Short CDN `s-maxage=30`. Upload limit for masters is **96 MB**.

## 2026-09-04 — Collated FY multi book, September vol defaults, expired puts

- Multi seed is no longer For Update–only. `npm run collate:multi`
  (`scripts/collate-multi-masters.ts`) merges eight FY21–FY27 Main Master XLSM files from
  Downloads into **2,505 products / 78,102 live legs** by unique Product Code (prefer richer
  leg book; blank/NaN/zero Required Quantity dropped; sorted by trade date ascending). Seed:
  `lib/data/multi-products-seed.json`. Collate also persists `multi_products` when Atlas is
  reachable. For Update remains a **subset** lock in `verify:multi-parse`.
- Sample multi masters: merged + repeated-row XLSX via `npm run build:samples`. The
  repeated-rows workbook is ~90 MB and gitignored.
- Default Volatility Surface is **September 2026** (`monthKey` `2026-09`). Reference Nifty
  **24,055.80** and Sensex **76,944.28** as of **1 Sep 2026** (roll at month start). If Mongo
  has no upload for the current calendar month, load uses the latest stored `monthKey`.
  Sample Nifty/Sensex strike rows are Excel formulas linked to **Surface Parameters** B8/B9
  × moneyness (sheet renamed; still matches `/param/i`).
- Expired puts (single + multi): both original Sell and Buy → `max(strike − spot, 0)`.
  Calls stay `max(spot − strike, 0)`. Premium Outflow on expired legs uses lot-rounded
  quantity × that settlement (actual exchange cash), not Product Premium.
- Multi parser: Product header may sit in column B; bloated XLSM `!ref` is clipped to the
  sparse used range.
- Product 1567 at 17-Aug / 24,366 with September references is about **₹136,995.07** (was
  ₹137,035.71 under August references). Golden 961 first-leg / headline move with the new
  anchors (~749.46 / ~146.93%).
- Deploy docs: local `collate:multi` + `seed` + `build:samples`; Vercel still deploys from
  `main`; Mongo multi book comes from collate persist.

## 2026-08-26 — Pricing e2e audit (vol / BS / unwind / distinct deltas)

- Added `verify:pricing` (`scripts/audit-pricing-e2e.ts`): golden vol/price/delta for 961,
  unwind marks match pricer, and deltas differ across expiries for the same strike+type on
  single + sampled multi books. Buy/Sell of the same Put sharing a delta is correct BS.

## 2026-08-26 — Desk edit: auto commas, wrong-input popup, Save keeps book

- Desk Book Edit commits on blur: Indian commas / ₹ / `%` are stripped automatically;
  valid cells reformat (e.g. `239125000` → `2,39,125,000`, `7.5` → `7.50%`).
- Invalid values (double decimals, letters, fraction in an integer field, bad dates)
  open the existing error popup titled **Wrong Input** — “Please try again” — and restore
  the previous cell.
- Save no longer auto-Refresh afterward (that round-trip was restoring the pre-edit book).
  Saved values stay on screen; **Refresh** still reloads the server / Mongo book and
  discards unsaved drafts.
- `verify:desk-edit` locks comma / percent / date parse helpers.

## 2026-08-21 — Sample Excel clean styling + download gate + Vercel type fix

- Sample input workbooks (`build:samples`) use a light header wash, thin gray borders, and
  compact row heights instead of heavy maroon/gold table fills. Brand maroon stays on the
  title/logo only. Data cells stay uncolored.
- Multi Product Book and Unwinding Options Book downloads wait until quotes/marks finish
  loading. `verify:downloads` locks all 139 multi quotes plus single/multi Excel sheet layout.
- ExcelJS alignment uses `vertical: "middle"` (not `"center"`) so `next build` / Vercel typecheck
  passes.

## 2026-08-21 — For Update book, desk Refresh, docs sync

- Multi book locked to **For Update.xlsm**: **139 products / 6,272 live legs** (blank/zero
  qty dropped; pasted duplicate option blocks deduped). Seed ≡ sample ≡ XLSM parse.
- Single vs Sample XLSM economics and pricer marks verified; multi product economics tallied
  against For Update Main Master (premium credited, Amt with NBFC, grown, prem grown, book
  unwind quotes within tolerance).
- Web Desk Book shows **27** columns (Contingent Level hidden). Excel uploads keep **28**.
- Single-desk **Refresh** on Product Master, Volatility Surface and Surface Parameters
  discards drafts and reloads the saved book. **Save** keeps the edited book on screen
  (auto-refresh after Save was removed so edits are not wiped). Without Mongo, edits are
  session-only.
- Docs and README updated off the stale 153 / 6,993 counts.

## 2026-08-19 — Drop Surface Parameters footnote

- Surface Parameters no longer shows the long note about sheet two, 100% anchors, live-spot
  Black–Scholes, Deep Strike, or Discount Yield. The cards and table already carry those values.



- Surface Parameters was still printing **₹ 24,366.00 / ₹ 78,009.25** when Mongo or an older
  upload stored those as `referenceUnderlyingPrice` / `referenceSensexPrice`. Stored values
  used to win over the August defaults.
- August 2026 now treats 24,366 / 78,009.25 as stale. Load and normalize replace them with
  the Yahoo last close on or before **1 Aug 2026**: Nifty **24,383.60**, Sensex **78,094.64**.
  A live Mongo document with the old pair is rewritten on the next dataset load.
- Deep stays ₹500; every other Strike Change column is percent × that index. Black–Scholes
  still uses the live unwind spot (17-Aug-2026 lock remains explicit Nifty **24,366**).
- Golden 961 at 21-Feb-2025 / 22,800: first-leg **779.84**, headline **147.08%**. Product
  1567 at 17-Aug / 24,366 is **₹137,035.71**.

## 2026-08-19 — Drop duplicate Contingent Level from Product Facts

- Product Facts, the multi Product Book, and screen Excel/PDF no longer show **Contingent
  Level**. On this book it equals **Initial Nifty Level** (961 = 17,600). The Product
  Master input still carries the column for upload/parse, and the engine still falls back
  Contingent → Initial when blank.
- Logic Atlas Pricer module metric said 15 columns; the live Pricer Table has **14**.

## 2026-08-19 — Drop misleading Expiries Tracked from Home and Logic Atlas

- **18** was `surface.expiries.length` (August Volatility Surface rows), not the product’s
  Option Expiry Dates (961 has four unique dates). That card is gone from Single Product
  Home and Logic Atlas. It stays on **Surface Parameters**, where it describes the vol grid.
- Upload and Logic Atlas copy still said **26-column** Product Master; both now say **28**.
- Multi-desk footer now shows the 153-product / 6,993-leg book instead of the single 961
  product leftover from DatasetProvider.

## 2026-08-19 — Final audit, docs sync, multi home snapshot trim

- Removed **Expiries Tracked** from the Multiple Product home Desk Snapshot. Single Product
  Home, Logic Atlas and Surface Parameters still show expiry count where it belongs.
- Full verification pass: `npm run verify` (all suites), live `npm run verify:desk` (all
  routes, golden single/multi replays, observation tabs, uploads, samples). Yahoo’s live
  17-Aug-2026 Nifty close may drift from the locked **24,366** fixture; engine replay with
  explicit spot **24,366** remains the audit lock (product 1567 = ₹137,040.68).
  `verify:desk` now asserts that historical close is finite, not that it equals 24,366.
- Docs 01–09 and both READMEs aligned: August 2026 seed (not July), multi APIs
  (`/api/multi/dataset`, quotes, uploads, product), Sensex name regex, Unwind Diff
  **column B** Excel / **column C** app, remaining-expiry observation tabs, Options Book
  PDF split, and Excel column auto-fit.

## 2026-08-19 — Observation tabs stay on remaining expiries, not calendar months

- Calendar-month filters emptied Observation in 2 / 3 Month on the
  live 153-product book (next remaining expiries start 22 months out). Tabs again use the
  next remaining unique Option Expiry Dates (Ongoing / 2nd / 3rd / 4th), which is dynamic
  from as-of and keeps all 153 products on every tab that has that many remaining dates.
- Sensex detection is a substring (`sensex`, S&P BSE, BSE Sensex) including glued names
  such as SensexAccelerator. This book’s 153 names are all Nifty; the path is ready for a
  Sensex master upload.
- Passed observation outflow remains intrinsic on the **unwinding date’s** fetched spot
  (spot − strike for calls, strike − spot for puts, floored at zero). Picking that
  observation as the Unwinding Date loads that day’s Yahoo close, matching Excel’s one
  Input Parameters spot for the whole book.

## 2026-08-19 — Sensex reference price (superseded observation-tab experiment)

**Superseded:** the calendar-month observation tab experiment below was reverted the same
day — see the entry above. Final behaviour uses remaining expiry slots.


- Surface Parameters and the August sample now carry **Reference Nifty Price** ₹ 24,366
  and **Reference Sensex Price** ₹ 78,009.25. The Vol Surface grid shows **Nifty Strikes**
  and **Sensex Strikes** above Expiry Date (Deep stays ₹ 500). Sensex products interpolate
  vol on the Sensex 100% anchor; Nifty products stay on 24,366. Legacy **Reference
  Underlying Price** still parses as Nifty.
- Multiple Product Book tabs (**Download Excel**, **Ongoing**, Observation in 3 / 2 / 1
  Month) classify remaining Option Expiry Dates by calendar months from the Asia/Kolkata
  as-of date, not by first/second/third remaining slot. Tabs still keep every option row.
- Repeated-rows Product Master sample auto-fits each column to the longest cell so payoff
  formulae and long names are readable. Download Excel on the product book does the same.
- Passed observation dates settle at intrinsic on that valuation day: calls `max(spot −
  strike, 0)`, puts `max(strike − spot, 0)`. Product names matching Sensex / BSE Sensex /
  S&P BSE select the Sensex spot and Sensex moneyness grid.

## 2026-08-18 — Sample downloads sit in one horizontal row

- Multiple Product Home and Upload put Volatility Surface, Product Master, and Product
  Master · Repeated Rows in one equal-width row.
- Unwind Diff (no header row): column B Excel quote, column C app quote. Engine at
  17-Aug-2026 / Nifty 24,366 matches column C on 138 products (1567 = ₹137,040.68).
  Column B is Excel’s frozen-strike Main Master quote and is not the app target.

## 2026-08-18 — Product Book observation tabs keep every expiry

- Multiple Product Version Product Master tabs (**Ongoing**, Observation in 3 / 2 / 1
  Month) now filter **products**, not Option Expiry Date rows. A product that used to
  collapse to one date keeps every remaining expiry and every option row.
- Single Product Version still has no those tabs.
- Sample Product Masters still write every Option Expiry Date from the seed (961 has
  four unique expiries; 1567 has its full 42-leg expiry set). Upload round-trip locks
  that on `verify:samples`.
- Desk Snapshot and Surface Parameters show **Reference Underlying Price** ₹ 24,366
  on both desks.

## 2026-08-18 — Reference Underlying Price on vol surface

- Surface Parameters now include **Reference Underlying Price** (August 2026: **24,366** —
  the 100% Strike Change anchor). Vol interpolation uses percent × reference; Black–Scholes
  still uses the live unwind spot.
- Parser, sample workbook, seeds, upload validation, Desk Book UI, and docs updated.
- Golden parity rebased: first-leg **778.23**, headline quote **147.07%** (`npm run verify`).

## 2026-08-18 — Excel Unwind Diff is stale MarketData strikes, not the app

- 17-Aug-2026 / Nifty 24,366 matches Yahoo and the Excel Calculator. Unwind Diff gaps
  (typically a few hundred to about ₹1,100, 139 products) come from Excel interpolating
  vol on a frozen absolute-strike row (~25,424.65) while Black–Scholes uses live spot.
  Live-spot moneyness is the desk convention; the app is left unchanged.
- Native XLSM Pricing Params (date column B, BID column C, Fwd Sell rate column H) is
  now parsed. The August sample still seeds one 7 percent point. On this book the
  native 15-row curve (3.85 percent then 7 percent) changes product 1567 by ₹0 —
  no live leg expires before the 7 percent point. Blank Required Quantity on the
  multiple master stays ignored and does not shift input columns.
- Docs 01–09 record the Unwind Diff audit (including Excel 1664 / 1605 outliers).
- `npm run verify:desk` hits every local route and the 17-Aug-2026 / 24,366 replay while
  the app is running on 3002.
- Live index “today” is the Asia/Kolkata calendar date on both the browser and Vercel.
  `/api/market/levels` is no-store so the 15:30 IST close flip is not CDN-cached.

## 2026-08-13 — Pricer delta cells no longer club across expiries

- Pricer / Options Book merges only identity columns (strike, side, spot, rates…). Expiry,
  vol, mid/sell/buy and **Option Delta** always stay one cell per leg, so 22,880 Aug vs Nov
  no longer share a blanked delta when values round close.
- Option Delta display widened to six decimals on screen and in Excel/PDF exports.

## 2026-08-13 — Contingent→Initial qty fallback aligned with premium %

- `computeUnwind` quantity rebuild (when Required Quantity is blank) now uses the same
  Contingent → Initial → 1 resolution as premium %. Blank Contingent no longer divides by 1.
- `verify:levels` locks raw blank-Contingent quote/qty behaviour without `toPlainProduct`
  masking the fallback.

## 2026-08-13 — Sample qty/price full precision; level-column calc lock

- Sample Product Masters keep display formats (`#,##0.00` / `#,##0.000`) but store full
  seed Spreads, Required Quantity, and Product Price precision so upload quotes match
  Atlas/seed exactly (rounding had nudged multi premium % by ~1e-6).
- Added `npm run verify:levels` to lock golden quote, Contingent→Initial fallback,
  and sample↔seed quote parity after the shared Initial/Contingent header work.

## 2026-08-13 — Same master level columns on Single and Multiple

- Single and Multiple Product Masters now share one canonical header list
  (`PRODUCT_MASTER_HEADERS`): **Initial Nifty Level** and **Contingent Level** are both
  present with the same names. Desk Book, Product Book, sample XLSX builders, and
  Excel/PDF fact rows no longer treat Contingent Level as a multi-only stand-in for
  Initial Nifty Level. Engine still falls back Contingent → Initial when Contingent is
  blank or zero.

## 2026-08-13 — Product Book Download Excel top-right

- Multiple Product home **Product Book** puts **Download Excel** on the top-right of the
  search row again (Unwinding / Pricer downloads stay bottom-right).

## 2026-08-13 — Docs synced to 28-column Desk Book

- Root README, docs index, and docs 01–06 now describe the **28** Product Master input
  columns (Contingent Level + Margin Cost), NSE desk spot rules, opaque sticky names, and
  multi-desk merges that stay inside each product.

## 2026-08-13 — Desk Book column alignment; Contingent Level + Margin Cost

- Multi Product Master Desk Book no longer merges Face Value / costs / inbuilt across
  products. Cross-product `rowSpan` was shifting cells so **Reported Inbuilt** and
  neighbours looked blank (visible on Nifty Accelerator - 1569). Merges stay inside each
  Sr. No. group.
- Desk Book input columns now include **Contingent Level** and **Margin Cost** (both on
  the reference Main Master files and used by `computeUnwind`).

## 2026-08-13 — Opaque sticky Product Name; blank-qty engine skip; thorough audit

- Product Book sticky Sr. No. / Product Name columns use fully opaque row fills (no
  alpha bleed when scrolling horizontally past long names like Nifty Accelerator 1577).
- `computeUnwind` / `priceProductBook` skip blank or zero Required Quantity legs on
  qty-driven books so filler rows cannot leak into Calculator premium.

## 2026-08-12 — Desk spot by NSE session; download buttons bottom-right

- Excel / PDF download actions sit in the bottom-right footer on Unwinding and Pricer.
  The Multiple Product home Product Book keeps **Download Excel** on the top-right of the
  search row.
- Live index feed (`/api/market/levels`) uses completed Yahoo daily closes only: prior close
  while NSE cash is open or pre-open, today's close after 15:30 IST, and the last trading-day
  close on weekends/holidays. The input badge shows Prior Close / Today Close / Last Close.
- Edge checks cover `pickDeskClose` session phases.

## 2026-08-12 — XLSM MarketData parse + end-to-end economics audit

- Volatility Surface parser now skips the absolute-strike row under Strike Change on
  XLSM MarketData sheets and reads expiry dates from column B/C, so reference calculators
  load the full expiry grid (14–15 rows) instead of a single misread strike serial.
- `scripts/e2e-xlsm-economics.ts` cross-checks Premium Credited, Amt with NBFC, Product
  Premium, Grown / Prem Grown and book Unwind Quote for the single sample and nine
  multi products against both reference XLSMs, plus live `/api/unwind` and
  `/api/multi/dataset`.

## 2026-08-12 — Full-width version rules; multi home columns; drop zero-qty legs

- Single Product Version / Multiple Product Version sit in a full-width band with gold
  rules (2px borders plus full-bleed gradient hairlines) running the entire horizontal
  length above and below the pill pair.
- Multiple Product home table drops Unwind Quote Percent and keeps Unwind Quote Amount
  ahead of the three IRRs and Product Facts.
- Main Master rows with blank or zero Required Quantity (475 unused expiry slots on the
  Apr 2025 book) are omitted from parse, seed, sample, and upload validation. The multi
  book is 153 products / 6,993 live legs. Same `computeUnwind` / Black–Scholes path on
  both desks; pricer deltas vary by strike and expiry.
- Docs and README updated for the version band, multi home columns, `multi_products`
  collection.

## 2026-08-11 — Centered version tabs; Main Master columns tallied on both desks

- Single Product Version and Multiple Product Version sit in the geometric centre of the
  brand header as a bordered gold pill pair, with the same sliding active state as the
  main nav. On smaller screens they wrap to a centred row under the title.
- Desk Book Product Master on both versions uses the same 26 input headers as the sample
  workbooks. Both Main Master Files were tallied: Apr 2024 `Trade Date` vs Apr 2025
  `Month`, `Product` / `Req.*` / `Prd Price` / `Buy / Sell`, Contingent Level when
  present, blank Margin Cost as zero, `asCoupon` so 1.18 stays 118%, and Sell +quantity
  signed for the engine. Same `computeUnwind` on both desks. Header uploads stay desk-aware.

## 2026-08-11 — Persist option-book premium in Mongo; show unwind loading again

- Atlas Product Master had `premiumFraction` missing, so a stale browser tab kept printing
  111.70% / ₹ 1.40 lakh. Load now writes the derived 53.53% back to Mongo. Preparing
  Unwind Marks shows for at least 700 ms and no longer vanishes when Yahoo ticks the spot.

## 2026-08-11 — Live unwind per debenture is ~₹ 2.05 lakh, not 112%

- Today plus live Nifty was printing Unwind Quote Percent 112% / ₹ 1.40 lakh because
  Product Master uploads and desk saves dropped `premiumFraction`. The engine then used
  Inbuilt + costs (~9%) for Premium Credited instead of Σ (Product Price × −Required
  Quantity) / Mobilization (53.53%). Grown premium is restored, so Book Unwind Per
  Debenture sits near ₹ 2.05 lakh. The field is derived on parse, load, and calculate.

## 2026-08-11 — No placeholder index; quote waits for a real spot

- Unwind Quote Percent 112.10% / ₹ 1,40,120.67 was the desk pricing today's residual tenor
  at the fake default Nifty 22,800 (Yahoo miss, CDN-cached fallback, or session restore)
  instead of the live index. Spot fields now default to **—**, session storage no longer
  keeps index levels, and Unwinding / Pricer do not compute until Yahoo or a typed level
  is present. Changing the unwinding date clears spots first so a stale print cannot mix
  with a new date.
- Live market no longer returns 22,800 / 75,000 with `source: "fallback"`. A miss is
  `unavailable` with null levels and `Cache-Control: no-store`. Yahoo is tried on query1
  and query2 without inventing a print.

## 2026-08-11 — Repair truncated Atlas write concern on Save and Upload

- Save Failed and a false Volatility Surface schema error both came from Atlas rejecting
  `w=majorit` (a truncated `w=majority` on Vercel). The Mongo client now repairs that name,
  sets majority write concern, and retries with `w=1` if needed.
- Upload Failed no longer calls a valid workbook a layout mismatch when the database write
  is what failed.

## 2026-08-11 — Premium per Spread is Product Price; unwind marks unsigned

- Options Book Premium per Spread was a Black–Scholes split of the mid mark. It is now the
  Product Price column from the Product Master, unsigned. Unwind Option Price no longer
  prints a minus. Premium Outflow Amount still carries the cash-flow sign.
- The Quantity Rounded column no longer says Lot Size. Headline Current Premium Outflow
  percent still uses the Calculator signed split, so the quote does not change.
- Vol lookup still sorts expiry and strike columns after edits, but a MarketData grid that
  stores absolute strikes (empty moneyness) is no longer collapsed to the Deep column.

## 2026-08-11 — Local upload probe: JSON 400, Blob files, 100–150 percent columns

- POSTing JSON to `/api/uploads/*` no longer 500s. The route reads multipart safely and
  returns JSON 400 when the file is missing. Blob uploads with a filename are accepted.
- Strike-change columns stored as 100–150 (not 1.00–1.50) are kept. Dropzones ignore a
  second file while an upload is in flight.

## 2026-08-11 — Desk Book Save works on Vercel end to end

- Save Failed on Volatility Surface (and Product Master) came from spreading Mongo
  metadata into `$set`, uncaught Atlas errors returning HTML 500, and warm lambdas
  pricing a stale in-memory book. Writes now persist only plain `VolSurface` /
  `ProductMaster` fields, catch Mongo errors as JSON, and load Mongo first.
- Unwinding and Pricer POST the live desk book with every calculate, so an edited table
  marks immediately across Vercel instances. Client save errors show the API issue list
  instead of a blank catch-all.

## 2026-08-11 — Options Book PDF is its own file; tables club by strike

- The Download PDF button below Unwinding output no longer appends an Options Book page.
  Options Book PDF comes only from Download Options Book PDF above the table.
- Same-value cells club inside each strike group on screen, Excel and PDF. The masthead
  gold bar and confidential line grow with wrapped copy so "Confidential desk report" is
  not cut off. The sample Product Master and August Volatility Surface uploads were
  replayed against the live buttons and both return 200.

## 2026-08-11 — Editable vol surface rows and sorted interpolation

- Volatility Surface and Surface Parameters can be edited on Home and Logic Atlas. Add or
  remove expiry rows and strike-percent columns, then Save. Product Master can add or
  remove option legs the same way.
- Bilinear vol lookup now sorts expiry dates and moneyness columns before interpolating, so
  a shuffled or newly inserted row cannot mark the wrong strike. Empty vol cells read as
  zero instead of NaN.

## 2026-08-11 — Independent upload overlay, editable Product Master, Nifty default

- Upload Failed and Upload Complete render on `document.body` at z-index 200, so the
  popup is a true page overlay and is no longer clipped inside the header or the top card.
- Files larger than 12 MB are rejected with a clear issue. Workbooks are scanned across
  every sheet (Main Master File, MarketData). JSON parse failures no longer collapse to a
  blank catch-all.
- Product Master on Home and Logic Atlas has Edit / Save / Cancel. Saved rows persist and
  Unwinding plus Pricer recompute from the edited book.
- Default Underlying is Nifty unless the product name matches `/sensex/i`. Live today plus
  Yahoo Nifty on the August surface prints unwind per debenture near ₹ 2.05 lakh.

## 2026-08-11 — No blank export pages; Pricer keeps Unwinding underlying

- Options Book and Pricer PDFs no longer open with a header-only blank page. Autotable
  rowspan on the first strike group was taller than the masthead leftover, so every data
  row spilled onto page two. PDF tables now print one row per leg. Excel print area is the
  used range, one page wide, no leftover Sheet1.
- Underlying chosen on the Unwinding Calculator is the Pricer default. Desk inputs stay in
  session storage so the pick survives a move to `/portfolio/pricer`.

## 2026-08-11 — Simple unwind loading and XLSM sheet audit

- Unwind and Pricer loading is a serif title and a thin gold rule. The spinning orbit is
  gone.
- All five sheets of the sample XLSM (Calculator, Main Master File, Pricer, Pricing Params,
  MarketData) were replayed. Rupee identities match to the paisa. On that file’s MarketData
  the ten priced legs match to a few paise; the 0.21 point quote gap is the fourteen OTM
  legs this engine marks. The live desk still uses the August 2026 surface (637.89 /
  147.76%). Locked by `npm run verify:xlsm`.

## 2026-08-11 — Sample Input buttons download Excel

- Volatility Surface Input · August 2026 and Product Master Input · Nifty Accelerator 961
  are real download links. Clicking either saves the `.xlsx` workbook instead of doing
  nothing.

## 2026-08-11 — Remove warped gold card rims

- Dropped the upper gold bars and glass mask-borders that sat off the rounded
  corners. Desk Snapshot cards are equal height and equal width in one row; values wrap
  instead of stretching the card out of shape.

## 2026-08-11 — August vol dates from the blue MarketData block

- Expiry dates now follow column C of `Vol Surface Aug'26.xlsx` (the blue `#C6D9F0`
  block): 30-Jun-2026, 28-Jul-2026, 25-Aug-2026, through 30-Apr-2031. SheetJS 18:29:50
  UTC artifacts no longer roll the calendar day back.
- Desk tables never show a leading plus on prices. Minus remains for outflows.
- Unwind and Pricer loading uses a gold orbit state instead of plain Computing unwind
  copy. The Volatility Surface expiry column on Home is tinted to match the workbook
  blue block.

## 2026-08-11 — Upload popups, header shortcuts, unclipped snapshot cards

- Desk Snapshot cards size to their copy and scroll horizontally, so labels such as
  August 2026 Volatility Surface are not clipped.
- Header shortcuts upload Volatility Surface and Product Master from the top right.
  Matching files show an Upload Complete popup; a wrong format shows Upload Failed with
  the schema issues. Expiry count and strike percents may change; other sample labels stay
  required. Home Desk Book refreshes after a successful upload.

## 2026-08-11 — August vol surface, signed unwind marks, Pricer without Option Code

- Default Volatility Surface is the August 2026 MarketData book. Deep Strike is hardcoded
  at ₹500. Strike Change percents include 135 percent. Eighteen expiries from Jun-2026.
- Option Code is removed from the Pricer Table (fourteen columns, Strike Price through
  Option Delta). Options Book has its own Download PDF button on the top right of the
  table. Current Option Price is omitted because it duplicated the unsigned unwind mark;
  Unwind Option Price keeps the cash-flow sign.

## 2026-08-11 — Underlying picker, issued-debenture default, open upload

- Current Option Price is the mid mark; Unwind Option Price is the bid or offer side.
- Default Number of Debentures is Total Debentures in Issue. Underlying starts at Choose
  The Value, then Nifty or Sensex drives the pricing spot and the vol moneyness grid.
- Volatility Surface input stores Strike Change percents only. Deep is ₹500 for any
  underlying. Bid Ask Spread is not on that file. Sample workbooks have uncolored data
  cells. Uploads no longer require login. Desk Book replaces Default Desk Book. Excel and
  PDF exports merge identical column values like the screen.

## 2026-08-10 — Club repeated table values down each column

- Product Master, Options Book and Pricer Table merge consecutive identical cells in a
  column into one row-span, so shared product facts and shared run inputs read as a single
  clubbed value while distinct strikes, expiries and marks stay on their own rows.

## 2026-08-10 — Full table rows and Number of Debentures last

- Product Master, Options Book and Pricer Table each show one complete row per leg.
  Identical values are no longer row-merged, so 24 legs stay 24 visible rows.
- Number of Debentures is the last Input Parameter, with Primary SP preset chips
  (1 / 10 / 25 / 50 / 100 / 250 / 500 / 800 / 1000) and a Max issued chip.

## 2026-08-10 — Intelligence pipeline cards and Primary SP desk footer

- Active Pipeline nodes are taller, flex to fill the shell, and carry two-to-three sentence
  descriptions like Primary SP Intelligence.
- Every page now has the Primary SP footer: desk name, option-leg count, live desk clock,
  and active-book status on the right.

## 2026-08-10 — Volatility Surface shows Expiry Date like the sample workbook

- Default Desk Book Volatility Surface matches `Vol_Surface_Input_July.xlsx`: Strike
  Change, Strike Price, then the Expiry Date corner label above the date rows.

## 2026-08-10 — Full-width Title Case tables; quantity aligned to master

- Every desk table stretches across the section. Column headers are Title Case, not
  full capitals, with layman names (Unwind Quantity, Option Delta, Initial Product Price).
- Number of Debentures is a single glowing input like the other Input Parameters.
- Options Book quantity now equals Required Quantity × (holding / issued book), so all
  expiries of a strike match the Product Master. Option Delta is shown to four decimals
  and is never merged across expiries.

## 2026-08-10 — Screen Excel and PDF match Primary SP desk chrome

- Download Excel and Download PDF now embed the ARWL logo, gold/maroon masthead, gold
  cell borders, ivory zebra tables, KPI tiles, disclaimer panel and page footers — the
  same language as the Primary SP Dashboard screen exports.
- Options Book exports drop SD Codes so they match the on-screen table. Filenames use
  `SP-{Screen}-{code}-{DD-MMM-YYYY}`.

## 2026-08-10 — Primary SP input rows; deduped unwind cards; Intelligence pipeline nodes

- Input Parameters uses one full-width row per field (label left, control right), matching
  Primary SP Product Details.
- Number of Debentures is the typed holding; Total Debentures in Issue is mobilization /
  face. Grown values stay date-dynamic from allotment to the unwinding date.
- Duplicate output cards removed (Pricer Unwind Value, repeated names, Options Premium
  Outflow). Percent vs rupee books keep distinct labels.
- Active Pipeline submodule cards match Primary SP Intelligence: short one-line copy,
  300–440px nodes, same kind icons.

## 2026-08-10 — Patch Next.js CVE-2025-66478 for Vercel

- Upgrade Next.js and `eslint-config-next` from 15.5.2 to 15.5.23 (RSC RCE advisory).
- Pin `engines.node` to `20.x || 22.x || 24.x` so Vercel does not auto-jump an unbounded major.

## 2026-08-09 — Reference Logic Modules horizontal scroll restored

- Six wide module cards sit in one nowrap row with the gold horizontal scrollbar.

## 2026-08-09 — Upload month is current month only; Surface Parameters table full width

- Volatility Surface upload dropdown offers only the current calendar month and year.
- Default Desk Book Surface Parameters key-value table stretches across the full row.

## 2026-08-09 — Full-width inputs and Desk Command; hide SD Codes; Vercel guide

- Input Parameters uses seven equal columns from 1280px so Product Name through Sensex Spot
  Level each fill the row.
- Options Book UI no longer shows the SD Codes column. The engine still computes `sdCode`
  and the Pricer Table still shows Option Code.
- Logic Atlas Active Pipeline cards carry Primary-SP-length descriptions. Desk Command and
  Reference Logic Modules stretch across the full horizontal row.
- New layman deploy guide: [09 Vercel](09-vercel-deploy.md) with every environment variable
  name and the exact `MONGODB_DB` value.

## 2026-08-09 — Logic Atlas pipeline cards restored; unused panels removed

- Active Pipeline cards again show kind, title and description like Primary SP Intelligence.
- Module Intelligence and Module Outputs panels removed (descriptions live on the pipeline cards).
- Headline SpecRail cards and the Computation Primitives table stretch across the full row.

## 2026-08-09 — On-screen tables match Primary SP premium chrome

- Every desk table (Product Master, Volatility Surface, Options Book, Pricer, Computation
  Primitives) uses the Primary SP cream/gold header, maroon uppercase labels and gold
  underline. Sample Excels keep maroon header cells and cell borders.
- Long row-span merges align to the top so 24-row product facts stay visible without
  scrolling into the middle of the cell.

## 2026-08-09 — Full Product Master columns, bordered desks, full-width inputs

- Default Desk Book Product Master now shows all 26 sample-workbook columns (Product Name through
  Margin Funding Rate), not a 7-column leg snapshot. Product facts merge across 24 rows; strike
  groups still club Option Type, Strike, Spreads and Original Buy Sell.
- Sample Product Master and Volatility Surface workbooks paint thin borders on every header and
  data cell, including merged ranges, so the grid matches the on-screen maroon table.
- Input Parameters fields stretch across the full panel in a 2 / 4-column fill grid.
- Docs 01–08 and both READMEs updated for the 26-column explorer, dual H+V table scroll,
  SpecRail nowrap scroll, Logic Atlas Master Data title, and SD Codes staying off the
  input Product Master.

## 2026-08-09 — Documentation expanded to full calculation maps

Every `docs/*.md` file and the root README rewritten to the depth of the Pricer Table
guide. Doc 03 covers column order, bilinear interpolation, the discount-yield convention,
Black–Scholes, a worked first-leg example, the golden ten-row table, the HTTP contract and
workbook column mapping. Doc 02 matches for the five unwind tabs, the two quote numbers,
Quantity versus Required Quantity, and per-leg `qtyDivisor`. Docs 01, 04, 05, 06 and 07
add API shapes, parser aliases, collection fields, Logic Atlas pipelines and a Markdown
preview checklist. Relative links, fence parity and single-H1 structure are verified so
GitHub and the IDE preview do not break.

## 2026-08-09 — Full-width cards, Title Case chrome, sexy input desk, unclipped book tables

- Desk Snapshot and every SpecRail now stretch to fill the horizontal row (wrapping when needed)
  with gold top-edge cards and maroon–gold gradient values.
- Buttons, tabs and card labels use Title Case rather than shouty small-caps.
- Input Parameters rebuilt as a two-column glowing desk panel (no more dull single-column stack).
- Default Desk Book tables are no longer height-clipped — all 24 Product Master legs and all 14
  surface expiries render in full. Volatility Surface uses the same premium gold–maroon table as
  the rest of the app. Original Side is clubbed only within a strike group so Buy does not bleed
  across neighbouring strikes.

## 2026-08-09 — Full Default Desk Book: merged Product Master plus both Volatility Surface sheets

- Product Master preview now clubs repeated column values with the same row-span merge used on the
  Options Book (Option Type, Strike Price, Spreads, Original Side).
- Volatility Surface preview is no longer a first-eight-strikes snapshot. It renders the complete
  workbook grid: Strike Change (Deep, 55% … 150%), Strike Price, Expiry Date (DD-MMM-YYYY) and
  every implied-volatility cell to two decimals, styled like the MarketData sheet (maroon
  corners, navy headers, light-blue expiry column, pale-blue zebra).
- A third tab, Surface Parameters, shows sheet two: Volatility Bump, Forward Sell Rate and Bid
  Ask Spread, as SpecRail cards plus a key-value table. The explorer is shared by Home and Logic
  Atlas.

## 2026-08-09 — Home book explorer, SpecRail outputs, Primary-parity Logic Atlas

- Desk Snapshot no longer shows Forward Sell Rate. Desk Modules are full-width tiles (no vacant
  button row) with sample downloads as a compact second row. A Default Desk Book explorer preview-
  loads the seeded Product Master and July Volatility Surface on Home and Logic Atlas.
- Input suffixes: Number of Debentures has no unit; Nifty and Sensex spot levels show ₹. Output
  tabs renamed so no tab mentions a currency unit (Whole Book Values). Every calculator section
  now uses Product-Facts-style `SpecRail` cards, including Options Book Summary.
- Logic Atlas rebuilt to the Primary SP Intelligence layout: hero, module rail, active pipeline,
  intelligence and outputs panels, desk command lanes and computation primitives.
- Product Master sample workbook restyled to maroon headers and warm cream input cells — no
  checkerboard yellow.

## 2026-08-09 — Pricer discount-yield convention fixed and locked with golden rows

- **Discount Yield = Forward Sell Rate + 1 percent.** The pricer previously discounted every
  option at the product discount rate (7.5 percent). A row-by-row audit of the reference pricer
  values showed the discount yield column is always the leg's forward growth plus one percentage
  point (7 percent forward → 8 percent yield). `lib/engine/pricer.ts` now derives the yield from
  the surface forward lookup inside `priceLeg`, and both the pricer table and the options-book
  unwind marks use it. First-leg price parity tightened from ±50 to ±1 rupee
  (944.33 vs golden 944.3253).
- **New verification suite `npm run verify:pricer`** (`scripts/verify-pricer-sheet.ts`): ten
  golden option codes at valuation 21-Feb-2025 and spot 22800 covering strikes 23408, 22880 and
  19008 across the quarterly expiries. Asserts interpolated volatility to 1e-9, discount yield
  exactly forward + 1 percent, price to within one hundredth of a rupee, delta to 1e-4 — 40
  assertions, all passing. Wired into the composite `npm run verify`.
- Upload authentication error message now says "volatility surface upload" (full form).
- **Quote difference explained and documented.** The reference book prices only 10 of the 24 legs
  and leaves the 14 deep out-of-the-money legs at zero unwind price; this engine marks every leg
  dynamically, which moves the golden-sample quote from 142.96 to about 143.17 percent. All 10
  commonly priced legs match the reference to the paisa.
- Docs 02, 03 and 07 updated with the discount-yield convention and the new suite.

## 2026-08-09 — Per-leg Product Price, dynamic dates, full UI overhaul

- **Per-leg Product Price.** The product master previously stored a single product-level price;
  the reference master carries a distinct price for each of the 24 legs. The raw extract, seed,
  `OptionLeg` type (`prdPrice`), unwind engine (`Product Premium = leg price × −required
  quantity`), workbook parser, sample builder and MongoDB seed were all updated. Three per-leg
  Product Premium parity assertions added (legs 0, 5 and 23).
- **Dynamic dates.** The default volatility surface is July of the current calendar year
  (bake script and parser), and the default unwinding date is today (dataset provider). No
  hardcoded years remain.
- **Full forms everywhere.** Volatility, Internal Rate of Return, Product Premium, Number of
  Debentures, and so on — across tables, cards, tabs, exports and error messages.
- **Home page.** Desk Snapshot rebuilt as a horizontally scrolling specification rail with
  dynamic card sizing; Desk Modules centered with the upload button removed; brand header
  simplified to logo, rule and serif title.
- **Input panels.** Unit suffixes inside the inputs (Nos, Pts, %) for both calculators; labels in
  gold uppercase chips.
- **Unwinding output.** Restructured into five tabs: Unwind Quote and Returns, Product Facts
  (specification rail), NBFC and Premium Growth, Whole Book Rupee Values, Options Book. Options
  book columns reordered with full-form headers and the duplicate action column removed.
- **Pricer table.** Full-form headers; download buttons moved below the output, as on the
  unwinding page.
- **Logic Atlas.** Card grid with selectable modules, each revealing an animated flowchart
  pipeline (input → process → engine → output nodes).
- **Upload page.** Month dropdown restricted to the current year, styled with calendar icon and
  chevron; verification popup closes on Escape.

## Earlier

- Excel and PDF exports for both calculators with the same sections as the UI.
- Session-verified uploads for the three authorised uploaders.
- MongoDB Atlas seeding for the default product, volatility surface and credentials.
- Black–Scholes engine with bilinear volatility-surface interpolation, expired-leg intrinsic
  settlement and bid-ask spread pricing.
- Golden parity, edge-case and sample round-trip verification suites.
