# Vercel Deploy

Last updated 06-Nov-2026 IST.

## Project

- Vercel project `active-management-dashboard`, Git-connected to `ShibayanBiswas/active-management-dashboard`, production branch `main`.
- Production URL: https://active-management-dashboard.vercel.app

## Environment

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas URI on `cluster0.lvoycia` (secret, never committed) |
| `MONGODB_DB` | `active_management` |
| `NEXT_PUBLIC_APP_URL` | `https://active-management-dashboard.vercel.app` |
| `DESK_WRITE_KEY` | Optional; when set, uploads need it to save |

## Release

1. Push to `main`. Vercel builds and promotes production.
2. CI runs typecheck, lint, knip, Vitest with the verify script, and the build, in about four minutes. Docs-only pushes skip CI.
3. After green CI on `main`, Production Smoke waits for the deployment, then checks:
   - `/api/health` reports the `active_management` database as connected;
   - every tab answers 200;
   - `/api/book/compute` prices the book.
   On failure it opens an issue.

## Manual Health Check

```bash
curl -s https://active-management-dashboard.vercel.app/api/health
```

Expect `"status":"ok"`, `"database":{"connected":true,"name":"active_management",...}` and a `checkedAt` in `+05:30`. A `degraded` status with a connected database means Yahoo was unreachable; the desk still runs on stored fixings.
