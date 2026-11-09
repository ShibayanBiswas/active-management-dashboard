# Active Management Dashboard

Anand Rathi Wealth desk application for structured-product **unwind and redemption
valuation** across the whole live book. It is the Unwinding Calculator's **Multiple Product
Version**, served at the root routes: the same 2,505-product master, the same Product Book,
five-tab Unwinding Calculator, Pricer Table, uploads, Logic Atlas, exports and numbers. There
is no Single Product Version. A fully dynamic Black–Scholes option book, NBFC and premium
grown values, whole-book economics, and Product, Client and Residual internal rates of return
as of any unwinding date.

On top of that sits the **Active Management layer** ([docs/11](docs/11-active-management.md)):
- Product Book columns for Current and Expected Internal Rate of Return, Actual and Effective
  Target, and Observations Passed and Left with their start and end dates.
- No Observation Passed and At Least One Observation Passed tabs.
- Assumed Nifty and Sensex Levels.
- Per-product Active Management, Black Scholes Pricer and ±1,000-point Scenario Grid tabs on the
  Unwinding Calculator.

Styling follows the Primary SP Dashboard (maroon `#7a1e2c`, gold `#d4b24c`, serif headings)
with the Dynamic Probability Calculator card language.

- Live: https://active-management-dashboard.vercel.app
- Embedded in SP Workstation, which changes tab with
  `postMessage({ type: "active-management:navigate", path })`.

## Quick start

```bash
npm install
cp .env.example .env.local    # optional: set MONGODB_URI; without it the desk runs on the seeds
npm run dev                   # http://localhost:3006
npm run verify                # typecheck + parity + edge + pricer + samples + upload + xlsm + exports + downloads + embed + am
npm run verify:desk           # live pages + multi APIs (needs npm run dev on port 3006)
npm run collate:multi         # FY21–FY27 multi book → multi-products-seed.json (+ Mongo when URI set)
npm run bake:am-targets       # Actual Target seed from the New Primary master (../Secondary SP Dashboard)
npm run build:samples         # clean sample input files (light headers, compact cells)
npm run seed                  # optional — requires MONGODB_URI (October vol surface + multi book)
```

Never commit `.env.local`. Never run `npm run build` while `npm run dev` is using the same
folder.

## Navigation

| Route | Purpose |
|-------|---------|
| `/` | Home — live Product Book (quote, IRRs, Premium Outflow, facts, and one Options Book row per leg, then the eleven Active Management columns; observation-date Reveal; observation progress tabs; Assumed Levels; no expired products), Post Observation Analytics, Desk Snapshot, Desk Modules, Desk Book with **Expired** tab |
| `/portfolio/unwinding` | Unwinding Calculator — product picker, five tabs plus Active Management, Black Scholes Pricer and Scenario Grid, each with branded Excel/PDF (dynamic columns, no cell padding) |
| `/portfolio/pricer` | Pricer Table — 14 columns, no Option Code, merged repeats, branded Excel/PDF |
| `/intelligence` | Logic Atlas — pipelines, primitives, desk module lanes |
| `/upload` | Volatility Surface and Multiple Product Master uploads — open, schema-checked, popup result |

There is no Desk tab and no Analytics tab. Portfolio holds exactly the Unwinding Calculator
and the Pricer Table. The book seeds **2,505 products / 79,190 live legs** collated from
eight FY21–FY27 Main Master XLSM files (unique Product Codes only; blank/NaN/zero Required
Quantity dropped; a repeated option row stays when its price, spread, or quantity differs;
an exact clone drops; richer leg book preferred on duplicate codes). **2,207** stay on the
live Product Book (Maturity Date ≥ today as of 2026-10-17); past-maturity names appear only
under Desk Book → Expired. Product Book quotes load via batched server marks
(`POST /api/multi/quotes`) so Home stays responsive on Vercel.

## Inputs

- **Unwinding Date** (allotment through today, default **today**), Underlying (Choose The
  Value, then Nifty or Sensex), Nifty Spot Level and Sensex Spot Level (Yahoo Finance live
  or historical), Bid Ask Spread (default 0). Number of Debentures defaults to Total
  Debentures in Issue. Input Parameters uses one full-width row per field, matching Primary
  SP Product Details.
- Two monthly uploads: Volatility Surface (percent Strike Change grid, Deep ₹500 carrying
  the 55% vols, Volatility Bump, Forward Sell Rate **6.60 percent**; seed monthKey
  **2026-10**, 14 expiries 27-Oct-2026 → 26-Mar-2031, sample `Vol_Surface_Input_October.xlsx`;
  rebake with `npm run bake:vol -- "<surface.xlsx>" <YYYY-MM>`) and the Multiple Product
  Master (**28 input columns**, including Contingent Level and Margin Cost). The web Desk
  Book shows **27 columns** (Contingent Level hidden — equals Initial Underlying Level on
  this book). First load is the seeded book; an upload replaces it. If Mongo has no surface
  for the current calendar month, the app loads the latest `monthKey` already stored.
- Spot for “as of today” follows the NSE cash session on the **Asia/Kolkata** calendar:
  prior close while the market is open, today’s close after 15:30 IST, last trading-day
  close on weekends and holidays. Default Unwinding Date is that same IST day.

## Calculation conventions (short)

| Topic | Rule |
|-------|------|
| Day count | Actual / 365 calendar days |
| Option discount | Discount Yield = Forward Sell Rate + 1% (seed forward 6.60% → 7.60%) |
| Product discount | 7.50% — NBFC compounding only, never option marks |
| Volatility | Bilinear strike × expiry interpolation on **Reference Nifty Price** or **Reference Sensex Price** × Strike Change percent (Sensex if the name or code matches Sensex / S&P BSE / BSE Sensex), plus Volatility Bump. Black–Scholes still uses the live unwind spot |
| Bid Ask Spread | Sell at `σ − z/2`, Buy at `σ + z/2`; default `z = 0` |
| Unwind mark | **Live:** Original Sell → Pricer Buy Price; Original Buy → Pricer Sell Price, rounded to two decimals after Black–Scholes. **Expired:** the in-the-money price from the Yahoo close on/before that leg's expiry, the same for Unwind Buy and Unwind Sell. Original Sell pays it; Original Buy receives it. Net Premium Outflow is the sum of the leg amounts and enters Unwind Value. **Pricer** stays Excel IFERROR → 0 |

Engine golden checks (`npm run verify:parity`, `verify:pricer`) replay Nifty Accelerator -
961 on the frozen September 2026 surface (`lib/data/vol-surface-golden-sep-2026.json`;
21-Feb-2025, spot 22,800, 800 debentures): first-leg price **684.61**, headline quote about
**147.18%**. Full maps: [02 — Unwind Quote](docs/02-calculation-logic.md) and
[03 — Pricer Table](docs/03-pricer-logic.md).

## Uploads

Viewing is public. There is no login. Every upload and every desk Save asks for the Desk
Key (the Hedging Sheet's key, set on the server as `DESK_WRITE_KEY`); it is kept in memory
until the page reloads. Without `DESK_WRITE_KEY` on the server nothing can be saved.
Header shortcuts and `/upload` accept the sample Excel layout. The Reference Nifty and
Sensex Prices shown are always the Yahoo closes on or before the 1st of the current month,
whatever the uploaded file lists. Expiry rows and strike percents on the Volatility Surface may
change; the Product Master keeps the same 28 column labels. A popup reports success or the
format errors. A valid upload replaces Home and both calculators.

## Deploy

Push to `main`. Vercel builds production; CI runs typecheck, lint, knip, the offline verify
scripts and the build; Production Smoke then checks the live routes. Environment:
`MONGODB_URI`, `MONGODB_DB=active_management`,
`NEXT_PUBLIC_APP_URL=https://active-management-dashboard.vercel.app`. See
[09 — Vercel deploy](docs/09-vercel-deploy.md).

## Documentation

Start at [`docs/README.md`](docs/README.md).

| Doc | Topic |
|-----|-------|
| [01 Architecture](docs/01-architecture.md) | Runtime, APIs, types, folders |
| [02 Unwind Quote](docs/02-calculation-logic.md) | Five tabs, economics, Options Book |
| [03 Pricer Table](docs/03-pricer-logic.md) | Columns, interpolation, Black–Scholes, golden rows |
| [04 Input files](docs/04-input-files.md) | Workbooks, parsers, upload schema |
| [05 MongoDB](docs/05-mongodb-and-seed.md) | Collections, bake / seed / fallback |
| [06 Routes and UI](docs/06-routes-and-ui.md) | Pages, tokens, Logic Atlas |
| [07 Testing](docs/07-testing-debug.md) | Verify scripts and FAIL playbook |
| [08 Change log](docs/08-changelog.md) | Dated history |
| [09 Vercel deploy](docs/09-vercel-deploy.md) | Project, env values, CI, Workstation embed |
