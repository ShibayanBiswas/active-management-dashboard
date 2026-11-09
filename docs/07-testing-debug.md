# 07 — Testing and Debugging

This is the desk’s verification map. Golden numbers live in
[doc 02](02-calculation-logic.md) and [doc 03](03-pricer-logic.md). Do not “fix” a FAIL by
loosening a tolerance until you understand whether the engine or the fixture moved.

## Command reference

```bash
npm install
npm run bake             # rebuild product-master + golden-parity JSON (on the frozen September golden surface)
npm run bake:vol -- "<surface.xlsx>" 2026-10  # monthly vol seed: Deep = 55%, passed expiries dropped, Yahoo 1st-session anchors
npm run collate:multi    # FY21–FY27 multi book → seed JSON (+ Mongo when URI set); also syncs New Primary expiries
npx tsx scripts/sync-observation-expiries.ts  # rewrite option expiries from Secondary New Primary Observation Average 1–7
npm run build:samples    # clean sample workbooks (28-col master, light headers, compact cells, live formulas)
npm run seed             # upsert Mongo surface + multi book (New Primary expiries)
npm run typecheck        # tsc --noEmit
npm run verify:parity    # 27 golden unwind assertions
npm run verify:edge      # expired intrinsic: sell pays, buy receives / zero-tenor / extreme-spot / desk-spot / span-group / Sensex / remaining-expiry observation + Expired tab + Product Book columns + 706 observation filter
npm run verify:pricer    # 40 golden pricer-row assertions
npm run verify:samples   # sample files → parsers → values; native XLSM Pricing Params layout
npm run verify:upload    # sample schema, desk routing, extra expiry/percent; local upload e2e when 3006 is up
npm run verify:vol-expiries  # October 2026 expiries 27-Oct-26 … 26-Mar-31, Deep = 55%, anchors, on seed / sample / live
npm run verify:xlsm      # replay Calculator / Main Master / Pricer on the sample XLSM surface
npm run verify:exports   # Options Book PDF layout (11 cols, no Quantity Rounded); Excel sheet count
npm run verify:levels    # Initial Underlying Level + Contingent Level header/quote lock
npm run verify:multi-parse  # collated 2,505 / 79,190 ≡ seed ≡ sample; For Update subset lock + Unwind Diff
npm run verify:downloads # multi quotes + Product Book / Options / Pricer Excel + zero-indent autofit + 8 XLSM ⊆ seed
npm run verify:pricing   # vol interp, BS price/delta, unwind marks, distinct deltas across expiries
npm run verify:desk      # live 3006 pages + multi APIs + market levels; skips if server is down
npx tsx scripts/e2e-xlsm-economics.ts  # Main Master economics vs computeUnwind on each file's MarketData
npm run verify:alignment # multi spans keep Reported Inbuilt aligned
npm run verify:embed     # SP Workstation postMessage navigation contract (active-management:navigate)
npm run verify:mongo     # Atlas connectivity + URI sanitiser (needs MONGODB_URI)
npm run verify           # typecheck + every verify:* suite above except desk and mongo
npm run dev              # http://localhost:3006
npm run build            # production build — stop dev first
npm run start            # serve the production build on 3006
```

## Do not build on top of a running dev server

`npm run build` and `npm run dev` share `.next`. Building while the dev server is up
corrupts that cache. Stop the dev server, build, then start again.

If port 3006 is stuck:

1. Find the Node process bound to 3006.
2. Stop it cleanly (do not kill unrelated terminals).
3. Run `npm run dev` again.

Never commit the `.next` folder.

## What each suite locks

### `verify:parity` — `scripts/verify-calculations.ts`

Valuation date **21-Feb-2025**, spot **22,800**, **800** debentures. Fixtures:
`lib/data/golden-parity.json` plus hard-coded rupee checks.

| Assertion | Tolerance |
|-----------|-----------|
| Amount with NBFC | `1e-6` |
| NBFC Grown | `5e-4` |
| Premium Credited / Amt NBFC Rs | 2,000 rupees |
| Grown Value / Premium Grown Rs | 1,50,000 rupees |
| Premium fraction | `1e-4` |
| Premium Grown percent | `0.002` |
| Product Internal Rate of Return | `0.001` |
| Invested tenor | 1 day |
| First-leg price | 1 rupee |
| First-leg display premium | 80 |
| Quantities (legs 0, 1, 8, 18) | 1 |
| Buy / Sell unwind counts 16 / 8 | exact |
| Product Premium legs 0, 5, 23 | 2,000 / 2,000 / 100 |
| Premium outflow percent | `0.05` |
| Pricer unwind / quote percent | `0.08` (September-surface golden, ~147.18%) |
| Quote amount rupees | 12,000 |
| Client / Residual IRR | `0.05` |

### `verify:pricer` — `scripts/verify-pricer-sheet.ts`

Ten Option Codes from the reference Pricer sheet. For each:

1. Interpolated volatility to `1e-9`
2. Discount Yield exactly 7.60 percent (forward 6.60 percent plus one)
3. Price within 0.01
4. Delta within `1e-4`

Full table: [doc 03 — Golden rows](03-pricer-logic.md).

### `verify:edge` — `scripts/test-edge-cases.ts`

1. All 24 legs expired → Options Book shows the in-the-money price, the same number for Unwind Buy and Unwind Sell. Put is max(strike − spot, 0). Call is max(spot − strike, 0). Original Sell pays. Original Buy receives a positive inflow. Each amount is that price times the row's Unwind Quantity. Net Premium Outflow is the sum of those amounts, and Unwind Value includes that sum. Pricer price stays 0; IV/bump/fwd/disc = 0
2. Direct `priceLeg` expired path (price 0 + IV 0)
3. Allotment-day invested tenor 0, finite IRRs and economics
4. Pre-allotment invested clamped to 0
5. Spot 1 and spot 100,000 stay finite
6. NSE desk-spot session phases (`pickDeskClose`)
7. Sensex name regex (substring / glued names; Bank Nifty stays Nifty)
8. Remaining-expiry observation tabs (Ongoing / 1 / 2 / 3 Month slots, not calendar months) plus Desk Book **Expired** tab and live-maturity filter for Product Book / pickers
9. Excel download autofit: date columns floor at width 12 (no `####`), content-sized widths
10. Passed-observation options: Pricer price 0. Options Book shows intrinsic for puts and calls. Sell pays. Buy receives. That cash enters KPI / quote.
11. Option marks / outflows are two decimal places end-to-end — never price 0.00 with a few paise of rupee outflow
12. All-products E2E log (`npx tsx scripts/audit-all-products-log.ts`): every live product’s SpecRail cards (Quotes / Funding / Rupees / Facts) in `logs/all-products-cards-<asOf>.json`, full Options Book + Pricer legs in `logs/all-products-run-<asOf>-results.json`, gate summary in `logs/all-products-run-<asOf>-summary.json`

### `verify:samples` — `scripts/test-sample-roundtrip.ts`

Parses both sample workbooks and prints strike count, expiry count, Surface Parameters,
product name, three representative legs (including per-leg Product Price) and the key
rates. A missing header or a renamed bump label fails the parser.

### `verify:vol-expiries` — `scripts/verify-vol-expiries.ts`

Locks the fourteen October 2026 dates from `Vol Surface for Oct26.xlsx` (27-Oct-26 through
26-Mar-31), Deep · ₹500 equal to the 55% column, Forward Sell Rate 6.60% and the 1 Oct 2026
anchors on the seed, the public seed, the sample workbook, and live `/api/multi/dataset`.

### `verify:xlsm` — `scripts/verify-xlsm.ts`

Replays `Unwinding Calculator (New) Mar 2022 (Apr'24-Mar'25) - Sample.xlsm` through the
live engine on that file’s MarketData grid (not the September 2026 seed):

1. First-leg vol, discount yield, forward, price and delta vs the Pricer sheet
2. All ten priced Calculator legs to 0.05 rupees
3. Amount with NBFC, grown values and Product Premium vs Main Master to the paisa
4. The remaining 0.21 percentage-point quote gap is the fourteen OTM legs this engine marks

### `verify:exports` — `scripts/verify-exports.ts`

Locks the Options Book PDF so page one is not a header-only blank, and Excel workbooks
contain only the sheets the desk adds.

### `verify:upload` — `scripts/test-upload-schema.ts`

Checks the sample schema, rejects a Product Master uploaded as a Volatility Surface,
accepts extra expiry rows and extra strike percents, keeps the 961 single-product sample
off the multi book, and — when the dev server is on 3006 — posts the samples end to end and
confirms `/api/multi/dataset` updates. That e2e block writes to Atlas when `MONGODB_URI` is set.

### `verify:downloads` — `scripts/verify-download-pipeline.ts`

Prices every **live-maturity** multi product (2,207 on 2026-10-17 / full seed 2,505), builds a Product Book
xlsx with finite quotes, and builds single + multi Unwinding workbooks with an Options Book
sheet whose row count matches each product’s legs. Asserts **zero cell indent** and
content-sized column widths on Product Book, Options Book, Pricer, and Unwinding Summary.
Also checks all eight Downloads XLSM Main Masters ⊆ seed. Product Book Download Excel on the
multi home stays disabled until every visible quote has finished loading.

### `verify:pricing` — `scripts/audit-pricing-e2e.ts`

Locks Black–Scholes mid price / delta and bilinear vol against the golden 961 codes,
checks unwind option marks match the pricer, and asserts that for the same strike+type,
deltas (and vols) differ across distinct expiries on single and sampled multi products.
Buy and Sell of the same Put correctly share one BS delta.

### `verify:desk` — `scripts/e2e-local-desk.ts`

Run with `npm run dev` on 3006. Locks Markdown preview (one H1, even fences, relative
links), the shared 28 Product Master headers on both samples, every desk route HTTP 200,
the multi dataset shape (14 October expiries / 6.60 percent forward; live products under the
2,505-product book, more than 50,000 live legs, product 1567 present), Yahoo market levels,
and a finite live Product Book quote for product 1567 from `POST /api/multi/quotes`. If
port 3006 is down, docs and header checks still run and the HTTP block is skipped.

## Debugging a FAIL

1. Read the assertion name (`optionPrice0`, `P4644323408 price`, …).
2. Compare with `lib/data/golden-parity.json` or the golden table in doc 03.
3. Volatility mismatch → `lib/engine/vol-surface.ts` interpolation or a stale seed
   (`npm run bake`).
4. Discount Yield not 0.08 → pricer plus-one-percent convention in `lib/engine/pricer.ts`.
5. Price off by more than a paisa → Black–Scholes / day-count.
6. Product Premium mismatch → per-leg `prdPrice` missing from the seed or parser.
7. Quote far from ~147.18 percent on the golden date → check that all 24 legs are being
   marked (the workbook zeros 14 of them on purpose).
8. Sample parse fail → header aliases in `lib/workbook/parsers.ts` or a rebuilt sample
   that lost live formula results (`npm run build:samples`).
9. Multiple-product Unwind Quote a few hundred to about ₹1,100 away from Excel Main
   Master on 17-Aug-2026 / Nifty 24,366 → Excel interpolates vol on a frozen MarketData
   strike row (~25,424.65). Date, Yahoo print, column order, and blank Required Quantity
   are not the cause. Do not retune interpolation onto Excel’s frozen strikes. See
   [doc 02](02-calculation-logic.md).
10. Multi Premium Credited wrong / huge negative → desk strategy forces
    `bookPremiumFraction` absolute-positive. Prefer seeded Main Master magnitude; blank
    Buy/Sell must not flip signed Req. Quantity (ARG26SP17 lock).
11. Live spot during cash hours is not today's incomplete bar → `pickDeskClose` in
    `lib/market-data.ts`. After 15:30 IST it must flip to `today_close`.
12. Home freezes while quotes load → quotes must go through batched
    `POST /api/multi/quotes`, not a full-book client `computeUnwind` loop.

## Upload debugging

| Symptom | Likely cause |
|---------|----------------|
| HTTP 400 | Header names or vol grid shape. Merged cells are forward-filled — check the sample. |
| HTTP 413 on the hosted desk | Vercel rejects request bodies over 4.5 MB before the route runs. Upload that workbook from a local run (`npm run dev`) or send a smaller file. |
| `persisted: false` | Mongo unreachable. This process still serves the uploaded book from memory. |
| Surface month missing | Dropdown is the current calendar month and year only. |
| Home still shows the seed after upload | Refresh Home. First load is the seed; later loads follow the last upload. |

## Smoke checklist after a UI change

Run these in order.

1. `npm run verify`
2. Hit `/`, `/portfolio/unwinding`, `/portfolio/pricer`, `/intelligence` and `/upload` —
   all 200
3. Home Desk Book: all **28** Product Master headers visible with H+V scroll;
   cream/gold Primary SP header chrome (maroon uppercase labels); Volatility Surface shows
  Deep through 150% and 14 live expiries (27-Oct-26 → 26-Mar-31), Deep equal to 55%, one cell per vol
  (no merged repeats), with Nifty Strikes and Sensex Strikes above Expiry Date;
  Surface Parameters shows Reference Nifty Price ₹ 22,421.95, Reference Sensex Price ₹ 71,909.70
  and 6.60% Forward Sell Rate. Home Desk Snapshot has no Expiries
  Tracked card (that count is Surface Parameters only). On `/`, Product Master
  observation tabs keep every Option Expiry Date for a product
  and map 1 / 2 / 3 Month to the next remaining unique expiries.
4. Unwinding Input Parameters fill the full panel width. Underlying defaults to Nifty
   unless the product name or code matches Sensex / S&P BSE / BSE Sensex. Number of
   Debentures defaults to the issued book. Options Book has **11 columns** and no Quantity
   Rounded column. Unwind Option Price matches the Pricer mark for a live leg. An expired
   option shows intrinsic: put max(strike − spot, 0), call max(spot − strike, 0). Original
   Sell pays it. Original Buy receives it as a positive inflow. That cash enters Premium
   Outflow / Unwind Value / headline quote (bold maroon). Pricer stays 0 after expiry.
   Out-of-the-money expired options stay 0 (faint).
   Product Premium Per Spread is Product Price. Logic Atlas pipeline cards size to their copy.
5. Unwinding date defaults to today. Spot fields show **—** until Yahoo fills them (or
   the user types). Today plus live Nifty should print unwind per debenture near ₹ 2.05
   lakh. A 112% / ₹ 1.40 lakh headline on today is wrong — that was Premium Credited
   falling back to Inbuilt + costs. Set 21-Feb-2025 / spot 22,800 / Underlying Nifty to
   read the golden quote (~₹ 1.84 lakh).
6. Pricer Table shows 24 rows and 14 columns from Strike Price through Option Delta, with
   Option Delta to six decimals, no merged delta/mid/expiry cells across legs, and **no
   Option Code column**. Discount Yield 7.60% on the golden date (seed forward 6.60% plus 1%).
7. Downloads produce Excel and PDF with the same sections as the screen. The PDF below the
   output has no Options Book page. Options Book has its own Download Options Book PDF on
   the table, with same-value cells clubbed inside each strike group.
8. Upload has no login. Header shortcuts sit on the top right. A matching sample shows
   Upload Complete; a wrong file shows Upload Failed as a full-page overlay, not inside the
   header card. Home Desk Snapshot and Desk Book update. Product Master and Volatility
   Surface can be edited on Home, including add or remove rows, then saved. Surface Month
   shows the current calendar month and year (October 2026 on 17 Oct 2026; the seed file stays September 2026). Snapshot cards
   are not clipped — long labels scroll horizontally.
