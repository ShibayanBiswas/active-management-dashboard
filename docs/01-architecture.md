# 01 — Architecture

Active Management Dashboard for Anand Rathi Wealth: the Unwinding Calculator's Multiple
Product Version served at the root routes. Next.js App Router on port **3006**. There is no
Single Product Version. Unwinding Calculator and Pricer Table mark the selected book **in the browser**
(`computeUnwind` / `priceProductBook`) so Multi-leg Product Masters never POST a huge
payload to Vercel. The Multiple Product home **Product Book** prices via batched
`POST /api/multi/quotes` (server-side `computeUnwind`); the client never bulk-prices the
full live book on the UI thread. Matured products load into a separate extras list for
the Desk Book Expired tab so they do not replace the live Product Book state.

Formulas live in [02 — Unwind Quote](02-calculation-logic.md) and
[03 — Pricer Table](03-pricer-logic.md). Persistence is in
[05 — MongoDB and seeding](05-mongodb-and-seed.md). Pages are in
[06 — Routes and UI](06-routes-and-ui.md).

## Runtime picture

```text
Browser (Next.js App Router, React 19)
  │
  ├─ MultiDatasetProvider (root layout, every route)
  │     GET /api/multi/dataset         → live book first
  │     GET /api/multi/dataset?scope=full → matured extras only (Expired tab)
  │     POST /api/multi/quotes {keys}  → batched server marks (max 64)
  │     quotes merge in place          → no blank wipe; no bulk client computeUnwind
  │
  ├─ Home
  │     Desk Book preview (Logic Atlas is the formula map only)

  │
  ├─ Unwinding Calculator
  │     computeUnwind in-browser (product + surface already loaded)
  │     GET  /api/market/levels
  │     GET  /api/market/index-at-date?date=YYYY-MM-DD
  │
  ├─ Pricer Table
  │     priceProductBook in-browser
  │     same market endpoints
  │
  └─ Upload
        POST /api/uploads/vol-surface
        POST /api/multi/uploads/product-master
        POST /api/multi/product
        POST /api/surface

MongoDB Atlas  database: MONGODB_DB (default active_management)
  vol_surfaces | multi_products | upload_logs

Fallback seeds (always present):
  lib/data/vol-surface-seed.json
  lib/data/multi-products-seed.json   (2,505 products / 79,190 live legs)

Engine golden fixtures (verify scripts only):
  lib/data/product-master-seed.json   (Nifty Accelerator - 961)
  lib/data/golden-parity.json, lib/data/xlsm-parity.json, lib/data/vol-surface-golden-sep-2026.json
```

Every page calls the same `computeUnwind` / `priceLeg` path. The desk
drops Main Master rows whose Required Quantity is blank, NaN, or zero before seed, sample
and upload. The multi seed is collated across FY21–FY27 XLSM masters (`npm run collate:multi`)
by unique Product Code (prefer the richer live leg book).

If MongoDB is unreachable the UI still runs from the baked seeds. Uploads then return
`persisted: false` and the in-memory / seed book remains active. Unwinding and Pricer mark
the selected product in the browser from the book already on screen, so they never
depend on a warm lambda.

When Atlas `multi_products` still matches the collated seed fingerprint, `/api/multi/dataset`
serves the deployment seed instead of pulling ~17 MB / 2,505 docs from Atlas on every cold
lambda (meta doc `kind: "book-meta"`). A desk upload or edit made on the current
deployment seed loads from Mongo; an Atlas book written on an older seed gives way to the
new deployment's seed.

## Data flow for one unwind run

1. `MultiDatasetProvider` loads `/api/multi/dataset`, selects a live product and fills
   its name / code into the shared inputs. Unwinding Date stays **today** until the user
   changes it.
2. The input panel resolves Nifty and Sensex: live Yahoo for today, historical close for a
   past date. The user may override the typed spots.
3. **Calculate** runs `computeUnwind` in the browser on the already-loaded Product Master
   and Volatility Surface (no huge product+surface POST).
4. `computeUnwind` prices each leg with `priceLeg` (same path as the Pricer
   Table).
5. Unwind Side flips Buy and Sell. The unwind mark is the Pricer Buy Price when
   unwinding a sell, and the Pricer Sell Price when unwinding a buy. Those **live** marks
   enter Premium Outflow and Unwind Value. An expired option uses one in-the-money price
   for Unwind Buy and Unwind Sell, from the Yahoo close on that expiry: put
   max(strike − spot, 0), call max(spot − strike, 0). Original Sell pays it. Original Buy
   receives it as a positive inflow. Each amount is that price times the row's Unwind
   Quantity. Net Premium Outflow is the sum of every leg amount, and that sum is in
   Unwind Value. Pricer Price/Sell/Buy stay Excel IFERROR → 0. Out-of-the-money expired
   options stay 0.
6. Display Quantity, lot round-off, Premium, Product Premium and Premium Outflow are
   computed per leg.
7. Whole-book rupee columns compound NBFC and premium over invested days.
8. Headline Unwind Quote Percent equals Pricer Unwind Value. Quote Amount is Face Value
   times that percent. Product, Client and Residual internal rates of return are solved
   from two cash amounts and a day count.

A Pricer Table run skips steps 6–8 and returns the 14 on-screen columns. `PricerRow.code`
stays in the engine object and is not rendered.

## Engine modules

| File | Role |
|------|------|
| `lib/engine/black-scholes.ts` | Normal CDF, forward Black–Scholes price, finite-difference delta |
| `lib/engine/vol-surface.ts` | Bilinear vol interpolation on Reference Nifty Price or Reference Sensex Price moneyness, Volatility Bump, Forward Sell Rate lookup |
| `lib/engine/pricer.ts` | One pricer row per leg; Discount Yield = forward plus one percent |
| `lib/engine/unwind.ts` | Quote, IRRs, whole-book values, Options Book rows (expired intrinsic: sell pays, buy receives) |
| `lib/observation-tabs.ts` | Desk Book: live Maturity Date gate + **Expired** tab. Product Book / Unwinding / Pricer: `LIVE_OBSERVATION_TAB_ORDER` (no Expired). Remaining unique Option Expiry Dates (Ongoing = all live-maturity; 1 / 2 / 3 Month = 2nd / 3rd / 4th). Not calendar-month distance |
| `lib/workbook/parsers.ts` | Volatility Surface and single-product Product Master upload parsers. Pricing Params / Surface Parameters accepts the month key/value block, the Date/Vol/Fwd table, and native XLSM (date B, BID C, Fwd H) |
| `lib/workbook/parse-multi-master.ts` | Multi-product Main Master parser (skips blank / NaN / zero Required Quantity; clips bloated XLSM `!ref` to sparse used range; Product header may sit in column B) |
| `lib/workbook/product-facts.ts` | Shared Product Facts labels for the Unwinding tab, Excel, PDF, and Multi Product Book |
| `lib/workbook/export-screen.ts` | Client-side Excel and PDF of the on-screen result (Primary SP chrome) |
| `lib/workbook/export-theme.ts` | Shared maroon / gold Excel and PDF theme |
| `lib/workbook/export-branding.ts` | ARWL logo fetch and Excel embed |
| `lib/market-data.ts` | Yahoo `^NSEI` / `^BSESN` desk closes (NSE session rule, IST calendar) and historical |
| `lib/utils.ts` | Day count, serial day, Indian number / percent format, `deskBlank` → `-`, row-span merge |
| `lib/data/load.ts` | Active Mongo document, process upload cache, or JSON seed |
| `lib/data/multi-load.ts` | Multiple-product book load / persist (`multi_products` + `book-meta` seed fast-path) |

## Core types

Defined in `lib/types.ts`.

| Type | Purpose |
|------|---------|
| `VolSurface` | Month key, label, Deep ₹500 (55% vols) plus percent columns, 14 live expiries on the October 2026 seed, `volsPercent` grid, `pricingParams`, `referenceUnderlyingPrice` (Nifty), `referenceSensexPrice` |
| `PricingParamPoint` | Date, `volBump`, `fwdSellRate` |
| `OptionLeg` | Type, strike, spreads, side, expiry, `reqQuantity`, `sdCode`, `prdPrice`, `qtyDivisor` |
| `ProductMaster` | Facts plus `legs[]` |
| `UnwindInputs` | Debentures, date, spots, Bid Ask Spread |
| `PricerRow` | One Pricer Table line |
| `OptionTableRow` | One Options Book line |
| `MasterEconomics` | Whole-book rupee block |
| `UnwindResult` | Full calculator response |

## API surface

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/market/levels` | Public | Live Nifty and Sensex |
| GET | `/api/market/index-at-date?date=` | Public | Historical close on or before the date |
| GET | `/api/multi/dataset` | Public | `{ products, surface, bookProductCount, liveProductCount, asOf }` — live-maturity products only (seed fast-path when Atlas meta matches) |
| POST | `/api/multi/quotes` | Public | Batched Product Book marks (`keys` required, max 64), including Premium Outflow and per-leg Options Book marks. Optional `products` slice for uploads before Mongo sync. Client falls back locally for missing keys. |
| POST | `/api/multi/uploads/product-master` | Public | Replace the multiple-product book |
| POST | `/api/multi/product` | Public | Save one edited multi-desk product |
| POST | `/api/uploads/vol-surface` | Public | Replace active surface |
| POST | `/api/surface` | Public | Replace active surface from the in-app editor |

Uploads are documented in [04 — Input files](04-input-files.md).

Market: if Yahoo is unreachable, live levels return `niftyLevel` / `sensexLevel` **null**
with `source: "unavailable"`. The desk shows **—** and does not price. Historical misses
return `source: "missing"`. A live or historical close of 22,800 is only used when Yahoo
actually returns that print (the 21-Feb-2025 golden), never as a silent default.

## Shared client state

`MultiDatasetProvider` (`lib/context/multi-desk-provider.tsx`) wraps the app in
`app/layout.tsx` and provides the `DatasetContext` declared in
`lib/context/dataset-provider.tsx`, so `useDataset()` returns the selected product.

| State | Default |
|-------|---------|
| `product` / `surface` | Selected live product and surface from `/api/multi/dataset` |
| `loading` | True until the first fetch finishes |
| `inputs.debentures` | 0 until the product loads, then issued count |
| `inputs.unwindDate` | Today `YYYY-MM-DD` |
| `inputs.spot` / `nifty` / `sensex` | Empty (**—**) until Yahoo or the user types a level |
| `inputs.bidAskSpread` | 0 |
| `inputs.underlying` | Nifty unless the product name or code matches Sensex / S&P BSE / BSE Sensex (`underlyingFromProductName`) |

`setInputs` patches the object. Unwinding Calculator and Pricer Table share the same
inputs, so changing the date on one page is visible on the other after navigation.
`saveProduct` writes an edited Product Master (plain fields only, no Mongo `_id`) and both
calculators recompute from the saved book. `saveSurface` does the same for the Volatility
Surface, including added or removed expiry rows and strike-percent columns. Interpolation
always sorts dates and moneyness first so a shuffled edit still marks the same strike.
Vol interpolation uses **live** spot × Strike Change percent, not a frozen MarketData
strike row from the XLSM. Mongo is the shared store on Vercel; the calculator POST body carries the live book so a
warm lambda cannot price a stale cache.

## Formatting helpers

| Helper | Output |
|--------|--------|
| `formatDeskDate` | `21-Feb-25` |
| `formatDeskDateFull` | `21-Feb-2025` (surface grid) |
| `formatPct` | `8.00%` from decimal `0.08` |
| `formatNumber` | Indian grouping, two decimals by default |
| `computeRowSpans` | Merge identical consecutive cells per column (Options Book, Pricer) |
| `computeGroupedRowSpans` | Same, but stop at a group key (Sr. No. or strike) so Face Value / costs / Original Buy Sell do not bleed across products or strike groups on the 28-column Product Master |

## Folder map

| Path | Contents |
|------|----------|
| `app/` | Routes, layouts, API handlers |
| `app/api/` | Market, surface, vol-surface upload, multi dataset/quotes/product/uploads |
| `components/dashboard/` | Unwind, pricer, Logic Atlas, header uploads, `desk-book-explorer.tsx` (27 web Product Master columns; Excel upload keeps 28) |
| `components/multi/` | Home page (Product Book, Post Observation), product book table, combobox, upload page |
| `components/layout/` | Brand header, nav, Workstation embed navigation, SpecRail, FieldStack, buttons |
| `components/ui/` | RevealOutput |
| `lib/context/` | DatasetContext, MultiDatasetProvider, theme |
| `lib/data/` | Baked JSON seeds + `load.ts` + `multi-load.ts` |
| `lib/engine/` | Pricing and unwind math |
| `app/api/uploads/` | Open Product Master and Volatility Surface replace |
| `lib/db/` | Mongo client + collection names |
| `public/samples/` | Downloadable Volatility Surface and Product Master templates (light headers, compact cells) |
| `scripts/` | Bake, collate multi masters, seed, sample builder, verify suites |
| `docs/` | This documentation set |

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15.5 App Router (patched 15.5.23+) |
| UI | React 19, Tailwind CSS 3, Framer Motion |
| Database | MongoDB Node driver 6 |
| Workbooks | ExcelJS (write), SheetJS `xlsx` (parse) |
| PDF | jsPDF + jspdf-autotable |
| Validation | Inline checks on API bodies (unwind / pricer) plus parser throws |

## Local ports and safety

- Dev and start scripts bind **port 3006** (`next dev --port 3006`).
- Never run `npm run build` while `npm run dev` is using the same folder — the shared
  `.next` cache corrupts. Stop the dev server, build, then restart. See
  [07 — Testing and debugging](07-testing-debug.md).
- Never commit `.env.local`.
- Production env names and paste values: [09 — Vercel deploy](09-vercel-deploy.md).
