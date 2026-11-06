# MongoDB And Seed

Last updated 06-Nov-2026 IST.

## Database

`active_management` on the sister desks' Atlas cluster (`cluster0.lvoycia`). Connection from `MONGODB_URI`; database name from `MONGODB_DB`, default `active_management`.

| Collection | Contents | Written By |
| --- | --- | --- |
| `products` | One document per product with its legs embedded, plus an `order` field | Product Master upload (replaces all) |
| `vol_surfaces` | Surfaces; the `active: true` one is used, with its bid ask table | Volatility Surface upload |
| `option_chains` | One document per expiry month | NSE Option Chain upload (upsert by month) |
| `fixings` | `{ date, close, source }`, unique by date | Fixing upload and the Yahoo fill on book load |
| `upload_logs` | File name, summary, first issues, IST timestamp | Every saved upload |

## Seed Fallback

`lib/data/seed/` holds a demo book baked from the reference workbook's cached values:

| File | Contents |
| --- | --- |
| `book.json` | 176 products, 4,245 legs, bid ask spreads, the workbook's as-of |
| `surface.json` | The 15-expiry surface |
| `chains.json` | The five NSE chains |
| `fixings.json` | 207 Nifty closes |

`lib/data/load.ts` reads each collection independently and falls back to the seed for any that is empty or unreachable. The desk therefore runs with no Mongo at all. Health reports `bookSource` as `mongo` or `seed`.

## Rebaking The Seed

Developer only; the app never reads the workbook.

```bash
python scripts/bake-seed.py "<path to the Active Management workbook>.xlsx"
python scripts/bake-seed.py --samples-only   # rewrite public/samples from the committed seed
```

The bake also writes `tests/fixtures/workbook-golden.json`, the cached workbook values the parity suite checks against.
