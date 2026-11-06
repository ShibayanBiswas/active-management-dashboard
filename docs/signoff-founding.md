# Sign Off: Founding Build

Signed off 06-Nov-2026 11:25 IST.

## Release

| Item | Value |
| --- | --- |
| Repository | https://github.com/ShibayanBiswas/active-management-dashboard |
| Release commit | `a199acb` (Build on Vercel as a Next.js app in Mumbai), on top of `9548a10` Founding: Active Management Dashboard Desk |
| CI | [Run 42169767858](https://github.com/ShibayanBiswas/active-management-dashboard/actions/runs/42169767858): success in 1m16s |
| Production Smoke | [Run 42169896051](https://github.com/ShibayanBiswas/active-management-dashboard/actions/runs/42169896051): success |
| Production | https://active-management-dashboard.vercel.app, deployment `dpl_4aVFcXRt3r4nhzTYbQ1HKtg19WF8`, created 11:10:06 IST, Ready about 11:11:35 IST (build 1m10s) |
| Database | `active_management` on `cluster0.lvoycia`: 176 products and 207 fixings saved through the upload API; surface and chains on the seed fallback |
| SP Workstation | [`423f690`](https://github.com/ShibayanBiswas/sp-workstation/commit/423f690) pushed to `main`: module between Unwinding Calculator and Swap Product Creation; `NEXT_PUBLIC_ACTIVE_MANAGEMENT_URL` set for production and preview, production redeployed |

> **Correction, 06-Nov-2026.** The first production deployment served 404 everywhere. The Vercel project had been created without a framework preset, so nothing was built. `vercel.json` now pins `nextjs`. That Production Smoke failure opened issue #1, which is closed.

## Health

```json
{"status":"ok","environment":"production","database":{"connected":true,"name":"active_management","collections":{"products":176,"vol_surfaces":0,"option_chains":0,"fixings":207,"upload_logs":2},"bookSource":"mongo"},"market":{"source":"yahoo","nifty":24536.6,"latestCloseDate":"2026-11-05"},"checkedAt":"2026-11-06T11:24:16+05:30"}
```

## Tests

| Suite | Result |
| --- | --- |
| `npm ci`, typecheck, lint, knip | Clean |
| Vitest | 210 of 210 passed: workbook parity, observations, scenario and IRR caps, Expected Difference, parsers, embed |
| `scripts/verify-active-management.ts` | 13 of 13 checks passed |
| `next build` | Green |
| Localhost on 3006 | Every route 200; Chromium smoke 9 of 9 |
| Production | Every route 200; Chromium smoke 9 of 9 |
| Workstation embed | Through a port 3000 parent frame, `active-management:navigate` changed tab and kept the edited Assumed Nifty; wrong path and wrong message type were ignored |
| Exports | Excel and PDF downloaded from Book Summary, Scenarios and a product page |

## Workbook Parity

- The unwind chain matches the cached workbook for 172 of 176 products. The four exceptions are workbook bugs listed in [Calculation Logic](02-calculation-logic.md).
- Model price, vol and delta match for every live key inside the surface, to under one paisa.
- Observation counts and residual targets match, once the workbook's history cut-off of 29-Sep-2026 is applied.

## Checklist

| # | Item | Status |
| --- | --- | --- |
| 1 | Dedicated repo, not inside Unwinding | Pass |
| 2 | Unwinding maroon and gold twin, Hedging standing UI rules | Pass |
| 3 | Routes: Book Summary, Observations, Scenarios, Legs, Pricing, Product, Intelligence, Upload | Pass |
| 4 | Expected Difference at Maturity with debug UX and the no-outflow test | Pass |
| 5 | Residual Target, Max IRR caps, Assumed Nifty, observation lifecycle, all dynamic | Pass |
| 6 | Scenario grid −1000 to +1500 step 100, delta default and Full Black Scholes toggle | Pass |
| 7 | NSE chain and surface pricing, Black Scholes delta, no add-ins, dynamic expired fixings | Pass |
| 8 | Typecheck, lint, test:ci, verify, build green; localhost 3006 smoked | Pass |
| 9 | Pushed to main; Vercel production Ready | Pass |
| 10 | `/api/health` ok on production; database `active_management` | Pass |
| 11 | SP Workstation module between Unwinding Calculator and Swap Product Creation; navigate embed | Pass |
| 12 | Docs, README, placeholder-only `.env.example`, unused code removed | Pass |
