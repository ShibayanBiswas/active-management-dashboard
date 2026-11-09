# Documentation index

Read these in order the first time.

Root [README](../README.md) is the five-minute quick start. This folder is the full map.
The Active Management Dashboard is the Unwinding Calculator's Multiple Product Version at
the root routes; these documents carry over from the Unwinding Calculator with the single
product desk removed.

## Reading order

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Architecture](01-architecture.md) | Runtime picture, API contracts, engine modules, types, folder map, stack |
| 02 | [Unwind Quote and Whole-Book Economics](02-calculation-logic.md) | Five output tabs, live marks + expired in-the-money prices, net Premium Outflow as the sum of the leg amounts, Options Book bold/faint, quantity rules, golden sample, Excel Unwind Diff audit |
| 03 | [Pricer Table](03-pricer-logic.md) | Fourteen columns, interpolation, discount-yield convention, Black–Scholes floored at 0, expired IV = 0, Pricer Excel 0 vs Options Book intrinsic in the quote |
| 04 | [Input files and upload](04-input-files.md) | Both workbooks (28-column Product Master Excel, collated FY21–FY27 multi book 2,505 / 79,190), clean sample styling, live formulas, parser aliases, open upload |
| 05 | [MongoDB and seeding](05-mongodb-and-seed.md) | Collections (including `multi_products`), document shapes, env vars, collate / bake / seed / fallback order, ongoing vs expired as-of (2,207 live on 2026-10-17) |
| 06 | [Routes and UI](06-routes-and-ui.md) | Every page, tabs (Desk Book **Expired**; Product Book live-only), counted Sell-put outflow bold, Download Excel autofit |
| 07 | [Testing and debugging](07-testing-debug.md) | Verify scripts, FAIL playbook, upload debugging, smoke checklist |
| 08 | [Change log](08-changelog.md) | Dated entries, newest first |
| 09 | [Vercel deploy](09-vercel-deploy.md) | Vercel project, env values, CI and Production Smoke, SP Workstation embed |
| 10 | [Master tally](10-master-tally.md) | Eight FY workbooks, New Primary observations, and the unwinding master |

## Suggested paths

- **Desk user** — start at the root README, then [06](06-routes-and-ui.md), then [04](04-input-files.md).
- **Quant / auditor** — [03](03-pricer-logic.md) then [02](02-calculation-logic.md), then [07](07-testing-debug.md). Use the Excel versus web-app section in [02](02-calculation-logic.md) before changing interpolation to chase Unwind Diff.
- **Engineer bringing the app up** — root README, [01](01-architecture.md), [05](05-mongodb-and-seed.md), [07](07-testing-debug.md). Run `npm run collate:multi` then `npm run seed` when Atlas is available. After `npm run dev`, run `npm run verify` then `npm run verify:desk` so every local route and the multi APIs are checked.
- **Going live** — [09](09-vercel-deploy.md) after seed works locally.
