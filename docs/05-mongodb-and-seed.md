# 05 — MongoDB and Seeding

Database name: `MONGODB_DB`, default **active_management**, on MongoDB Atlas.

The app is designed to run **with or without** a live database. Seeds in `lib/data/` are
the cold-start book. Mongo, when reachable, overrides them with the active documents.

Connection helper: `lib/db/mongo.ts` → `getDb()`. Missing `MONGODB_URI` or a failed
handshake returns `null` (never throws into the page). Server selection timeout is 8
seconds so a blocked Atlas IP fails inside a Vercel Hobby window instead of as HTML 504.
The URI is sanitized before connect: a truncated `w=majorit` becomes `w=majority`. Writes
retry once with `w=1` if Atlas still rejects the write concern.

## Collections

| Collection | Constant | Purpose | Active flag |
|------------|----------|---------|-------------|
| `vol_surfaces` | `COLLECTIONS.volSurfaces` | Monthly surfaces plus Surface Parameters | `isActive: true` |
| `multi_products` | `COLLECTIONS.multiProducts` | Multiple Product Version book (`bookKey: "multi-desk"`) | `isActive: true` |
| `upload_logs` | `COLLECTIONS.uploadLogs` | Audit trail of uploads (which book, when) | — |

Only one surface should be `isActive: true`. The multi book is replaced as a whole
(`bookKey: "multi-desk"`). Seed and upload paths flip other surface documents to
`isActive: false` before upserting the new active one.

## Document shapes

### `vol_surfaces`

Same fields as `VolSurface` in `lib/types.ts`, plus:

| Extra field | Meaning |
|-------------|---------|
| `isActive` | The surface `/api/multi/dataset` will serve |
| `source` | `seed` or upload origin |
| `updatedAt` | Date |
| `monthKey` | `YYYY-MM`, unique upsert key |

### `multi_products`

Product documents on the desk. Same `ProductMaster` fields
plus `bookKey: "multi-desk"`, `productKey` (`name::code`), `isActive`, `source`,
`updatedAt`. Cold-start seed: `lib/data/multi-products-seed.json` — **2,505 products /
79,190 live legs** (collated FY21–FY27 Main Masters via `npm run collate:multi` after
dropping blank/NaN/zero qty rows and keeping one Product Code per richer leg book).
Ongoing versus expired is **not stored**. Each Asia/Kolkata day, `/api/multi/dataset`
recomputes Maturity Date against that as-of. Product Book / Unwinding / Pricer receive
only the ongoing set (**2,207** on 2026-10-17). Past-maturity names appear only on Desk
Book → Expired. An open desk rolls the split again when the IST date changes.

**Expired option cash vs Excel:** Excel / Pricer stores 0 after expiry (unchanged). The
desk Options Book prices an expired option at the in-the-money amount, the same price
for Unwind Buy and Unwind Sell. A put is max(strike − spot, 0). A call is max(spot −
strike, 0). Original Sell pays it. Original Buy receives it. Each amount is that price
times the row's Unwind Quantity, and net Premium Outflow is the sum of those amounts.
That sum enters Unwind Value. The cash is computed at run time from the expiry close
and the strike; it is not stored in Mongo.

Also stores one meta document `{ bookKey: "multi-desk", kind: "book-meta", isActive: false,
productCount, legCount, source, seedFingerprint, baseSeedFingerprint, updatedAt }`. Meta stays inactive so
legacy `{ isActive: true }` finds never treat it as a product. When `seedFingerprint`
matches the deployment seed, `/api/multi/dataset` serves the baked JSON instead of
streaming every product doc from Atlas (keeps Vercel cold loads responsive for the
standard collated book). The fingerprint includes product count, leg count, the first
and last product, and a mix of every Option Expiry Date, so a New Primary date rewrite
does not keep serving an older seed. `baseSeedFingerprint` is the deployment seed that
was live when the book was written. A desk upload or edit made on the current seed reads
the Mongo product docs on the next cold load; an Atlas book written on an older seed
loses to the seed shipped with the new deployment.

## Environment

Copy `.env.example` to `.env.local` (never commit `.env.local`):

| Variable | Role |
|----------|------|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | `active_management` |

The surface month comes from the seeded / uploaded Volatility Surface (`monthKey`,
currently `2026-11`), not from an environment variable.

Production on Vercel uses the same two names. Exact paste values and Atlas IP steps:
[09 Vercel deploy](09-vercel-deploy.md).

`scripts/load-env.ts` loads `.env.local` for bake / seed / verify scripts that run outside
Next.js.

## Seed command

```bash
npm run bake             # rebuild product-master + golden-parity JSON (vol seed stays)
npm run collate:multi    # rebuild multi-products-seed.json from FY21–FY27 XLSM (+ persist multi_products)
npm run build:samples    # rebuild public/samples/*.xlsx (repeated-rows multi sample is gitignored)
npm run ensure:repeated-sample  # build Repeated Rows only when missing (also runs before `next build` on Vercel)
npm run seed             # upsert November surface and Nifty Accelerator - 961
```

What `npm run seed` writes (`scripts/seed-mongo.ts`):

1. **November 2026** Volatility Surface marked `isActive: true` (`monthKey` `2026-11`).
   - Volatility Bump 0.00%
   - Forward Sell Rate 6.60%
   - Reference Nifty Price 23,053.10 and Reference Sensex Price 74,459.53 (100% Strike Change anchors as of **1 Nov 2026**, the 30 Oct closes)
   - Deep Strike hardcoded ₹500, carrying the 55% vols
   - Strike Change percents only (no absolute strike row)
   - 21 strike columns × 14 live expiries (23-Nov-2026 → 26-Mar-2031)
2. Product Master **Nifty Accelerator - 961** / ARG24SP06 Series I marked `isActive: true`.
   - All 28 input-workbook columns (product facts including Contingent Level and Margin Cost + option legs)
   - 24 legs with per-leg `prdPrice`, `sdCode`, `qtyDivisor`, `reqQuantity`
   - `sdCode` and `qtyDivisor` are seed / engine fields, not upload headers

`npm run collate:multi` (`scripts/collate-multi-masters.ts`) reads eight Downloads Main
Master XLSM files (FY21–FY27, including Sensex books), keeps unique Product Codes
(preferring the richer live leg book), drops blank/NaN/zero Required Quantity and
duplicate option positions, sorts by trade date ascending, writes
`lib/data/multi-products-seed.json` (**2,505 / 79,190**), then rewrites Option Expiry
Dates from the Secondary New Primary Observation Average 1–7
(`scripts/sync-observation-expiries.ts`), and replaces the
`multi_products` book when Atlas is reachable. Gate: every ISIN in those eight files is
⊆ seed (`verify:downloads` — **0 missing**). Rebuild samples afterward with
`npm run build:samples` (light headers, thin gray borders, compact cells; the repeated-rows
multi sample is ~90 MB and gitignored). The legacy For Update XLSM remains a subset lock in
`verify:multi-parse`, not the seed source.
If Mongo is unreachable the seed script exits with code 1 and prints
`MongoDB unavailable — check MONGODB_URI`.

The surface year is **not** hardcoded in the product bake. `scripts/bake-seeds.ts` rebuilds
the product master and golden parity. The file on disk is the **November 2026** grid
(`monthKey` `2026-11` in the seed, baked by `npm run bake:vol -- "<surface.xlsx>" 2026-11`) until a
new month is baked or uploaded. On the desk,
if that month has no upload, the previous grid continues under the **current** calendar
month name, and Reference Nifty / Sensex become the Yahoo close on the first session of
that month. The seed forward is one point at **6.60 percent**. Uploading an XLSM with a
native Pricing Params sheet keeps the dated forward curve. Excel MarketData absolute
strikes are never written into the seed — Deep stays ₹500 and the percent columns stay
percents.

## Runtime load order

`lib/data/load.ts`:

```text
1. Mongo: vol_surfaces (prefer current calendar monthKey; else latest monthKey in Mongo)
   and multi_products (lib/data/multi-load.ts; seed fast-path when the book-meta
   fingerprint matches the deployment seed). Shared source of truth across Vercel lambdas.
2. Else process upload cache from this server
3. Else lib/data/*-seed.json
4. Strip _id / isActive / source / updatedAt and keep only VolSurface / ProductMaster fields
```

Desk Book Save and uploads write **plain** product and surface documents. Spreading a Mongo
document (with `_id`) into `$set` would 500 on Vercel. Writes are try/caught and return
JSON, never an HTML error page.

Uploads remember the book in process memory, upsert Mongo when reachable, and flip
`isActive`. If Mongo is down the API still parses the file, returns `persisted: false`,
and Home still shows the uploaded book for this server process. First load with an empty
cache uses the seeded Desk Book. Unwinding and Pricer price the selected product in the
browser, so in-session edits price immediately.

## Default Unwinding Date

Not stored in Mongo. `lib/context/multi-desk-provider.tsx` sets `unwindDate` to **today**
on every fresh session and whenever a product is selected. Change it in the input panel to 21-Feb-2025 to reproduce golden checks
in [doc 02](02-calculation-logic.md) and [doc 03](03-pricer-logic.md).

## Local JSON artefacts

| File | Role |
|------|------|
| `lib/data/product-master-seed.json` | Nifty Accelerator - 961, the engine golden fixture for the verify scripts (not loaded by the app) |
| `lib/data/vol-surface-seed.json` | November 2026 grid, Reference Nifty 23,053.10, Reference Sensex 74,459.53 as of 1 Nov 2026 (30 Oct closes), Forward Sell Rate 6.60%, 14 live expiries, Deep = 55% |
| `lib/data/vol-surface-golden-sep-2026.json` | Frozen September 2026 grid for the golden parity / pricer locks |
| `lib/data/multi-products-seed.json` | 2,505 products / 79,190 live legs |
| `lib/data/golden-parity.json` | Reference-book headline numbers for `verify:parity` |

After changing the multi masters, always `npm run collate:multi` then `npm run build:samples`
and `npm run verify` before relying on Atlas. `npm run bake` rebuilds the 961 golden
fixtures from `lib/data/_raw_extract.json`; run `npm run verify` before `npm run seed`, so
Atlas does not receive a stale book.
