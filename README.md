# Active Management Dashboard

Whole-book active management desk for Anand Rathi Wealth structured products. It revalues every live product at the current and an assumed Nifty, tracks observation progress and residual targets, caps IRRs at the product's Max IRR, runs a scenario ladder, and checks each product's accruals with the Expected Difference at Maturity.

- Live: https://active-management-dashboard.vercel.app
- Twin of the [Unwinding Calculator](https://github.com/ShibayanBiswas/unwinding-calculator) (chrome, Black Scholes, vol surface, NBFC grow and unwind) with the [Hedging Sheet](https://github.com/ShibayanBiswas/hedging-sheet) dedicated-repo and light CI habits.
- Embedded in [SP Workstation](https://github.com/ShibayanBiswas/sp-workstation) as the `active-management` module.

## Run Locally

```bash
npm ci
cp .env.example .env.local   # optional: without MONGODB_URI the desk runs on the seeded demo book
npm run dev                  # http://localhost:3006
```

## Verify

```bash
npm run typecheck
npm run lint
npm run lint:unused          # knip
npm run test:ci              # Vitest engine goldens, then scripts/verify-active-management.ts
npm run build
npm run e2e:smoke            # optional, one Chromium smoke; BASE_URL=... to point at a deployment
```

## Routes

| Route | Tab |
| --- | --- |
| `/` | Book Summary |
| `/observations` | Observations And Targets with Expected Difference at Maturity |
| `/scenarios` | Scenario Grid |
| `/legs` | Leg Book |
| `/pricing` | Option Chain And Surface Pricing |
| `/product/[id]` | One Product What If |
| `/intelligence` | Logic Atlas |
| `/upload` | Uploads |
| `/api/health` | Health JSON |

## Deploy

Push to `main`. Vercel builds production; CI runs typecheck, lint, knip, Vitest, the verify script and the build; Production Smoke then checks the live health and routes. See [docs/09-vercel-deploy.md](docs/09-vercel-deploy.md).

## Docs

- [Architecture](docs/01-architecture.md)
- [Calculation Logic](docs/02-calculation-logic.md)
- [Input Parameters Guide](docs/input-parameters-guide.md)
- [MongoDB And Seed](docs/05-mongodb-and-seed.md)
- [Vercel Deploy](docs/09-vercel-deploy.md)
- [Founding Sign Off](docs/signoff-founding.md)
