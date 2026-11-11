# 09 — Vercel Deploy

## Project

- Vercel project `active-management-dashboard`, Git-connected to `ShibayanBiswas/active-management-dashboard`, production branch `main`.
- `vercel.json` pins the Next.js framework and the Mumbai region (`bom1`); without the pin, a project created from the CLI builds nothing and serves 404.
- Production URL: https://active-management-dashboard.vercel.app
- Node `24.x` (`package.json` engines).
- Build command is the default `npm run build`, which first runs `scripts/ensure-repeated-sample.ts` to rebuild the gitignored `public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx`, then `next build`.
- `.vercelignore` keeps reference workbooks (`*.xlsx`, `*.xlsm`) out of CLI uploads but keeps `public/samples/*.xlsx` and every JSON seed in `lib/data/`.

## Environment

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas URI on `cluster0.lvoycia` (secret, never committed) |
| `MONGODB_DB` | `active_management` |
| `NEXT_PUBLIC_APP_URL` | `https://active-management-dashboard.vercel.app` |
| `DESK_WRITE_KEY` | The Hedging Sheet's Desk Key, the same value as on the hedging-sheet and Unwinding projects (secret). Without it every upload and Save is refused with "Saving Is Turned Off" |

Without `MONGODB_URI` the desk still runs on the seeds: `lib/data/multi-products-seed.json`
(2,505 products) and `lib/data/vol-surface-seed.json`. Uploads then answer
`persisted: false` and live only in that server process. The collections are the
Unwinding Calculator's multi layout (`vol_surfaces`, `multi_products`, `upload_logs`) inside
`MONGODB_DB`; see [05 — MongoDB and seeding](05-mongodb-and-seed.md). `npm run seed`
writes the November surface and the multi book to that database.

## Release

1. Push to `main`. Vercel builds and promotes production.
2. CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, lint, knip, the offline verify
   scripts and the build. Docs-only pushes skip CI.
3. After green CI on `main`, Production Smoke (`.github/workflows/production-smoke.yml`)
   waits for the deployment, checks that `/`, `/portfolio/unwinding`,
   `/intelligence` and `/upload` answer 200 and that `/api/multi/dataset` returns the book.
   On failure it opens an issue.

## SP Workstation embed

SP Workstation frames this app and changes tab with
`postMessage({ type: "active-management:navigate", path })` from
`https://sp-workstation.vercel.app` (and `http://localhost:3000` outside production).
`lib/embed-navigation.ts` accepts only those origins, only the parent window, and only the
five nav routes. `components/layout/embed-navigation.tsx` replaces the route with the client
router so the desk inputs survive.
