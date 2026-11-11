/**
 * Live-server desk check. Requires `npm run dev` on port 3006.
 * Skips cleanly when the server is down so `npm run verify` stays offline-safe.
 */
import fs from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";

import liveVolSeed from "../lib/data/vol-surface-seed.json";
import { MULTI_BOOK_LEG_COUNT, MULTI_BOOK_PRODUCT_COUNT } from "../lib/multi/book-stats";
import { productKey } from "../lib/multi/product-key";
import type { ProductMaster, VolSurface } from "../lib/types";
import { DESK_MASTER_HEADERS, PRODUCT_MASTER_HEADERS } from "../lib/workbook/master-columns";

const BASE = process.env.DESK_BASE_URL ?? "http://localhost:3006";
const YESTERDAY = "2026-08-17";
const YESTERDAY_NIFTY = 24366;

let failures = 0;

function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { cache: "no-store" });
  return { status: res.status, text: await res.text() };
}

function headerRow(filePath: string): string[] {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });
  const found = grid.find((row) =>
    String(row?.[0] ?? "")
      .trim()
      .toLowerCase()
      .includes("product name"),
  );
  return (found ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
}

function docsContract() {
  const docsDir = path.join(process.cwd(), "docs");
  const files = ["README.md", ...fs.readdirSync(docsDir).filter((name) => name.endsWith(".md")).sort()].map((name) =>
    name === "README.md" ? path.join(process.cwd(), "README.md") : path.join(docsDir, name),
  );
  files.push(path.join(docsDir, "README.md"));
  const unique = [...new Set(files)];
  for (const file of unique) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const h1 = [...text.matchAll(/^# /gm)];
    assert(`${rel} one H1`, h1.length === 1, String(h1.length));
    const fences = [...text.matchAll(/^```/gm)];
    assert(`${rel} fences even`, fences.length % 2 === 0, String(fences.length));
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((href) => !href.startsWith("http"));
    for (const href of links) {
      const target = href.split("#")[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), target);
      assert(`${rel} link ${href}`, fs.existsSync(resolved));
    }
  }
}

async function main() {
  docsContract();

  const singleHeaders = headerRow("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx");
  const multiHeaders = headerRow("public/samples/Product_Master_Input_Multiple_Products.xlsx");
  assert("single sample 28 headers", singleHeaders.length === 28, String(singleHeaders.length));
  assert("multi sample 28 headers", multiHeaders.length === 28, String(multiHeaders.length));
  assert(
    "single and multi header order match",
    singleHeaders.join("|") === multiHeaders.join("|"),
    `single=${singleHeaders.join(", ")}`,
  );
  assert(
    "desk headers match DESK_MASTER_HEADERS",
    DESK_MASTER_HEADERS.join("|") === PRODUCT_MASTER_HEADERS.filter((h) => h !== "Contingent Level").join("|"),
  );
  assert("headers include Unwinds count column", singleHeaders.includes("Unwinds"));
  assert(
    "unwind quote is not an input header",
    !singleHeaders.some((h) => /unwind(ing)?\s*quote/i.test(h)),
  );

  try {
    const ping = await fetch(`${BASE}/api/multi/dataset`, { cache: "no-store" });
    if (!ping.ok) {
      console.log("SKIP live desk: dataset not ready");
      if (failures) process.exitCode = 1;
      return;
    }
  } catch {
    console.log("SKIP live desk: dev server not running on 3006");
    if (failures) process.exitCode = 1;
    return;
  }

  const pages = [
    "/",
    "/portfolio/unwinding",
    "/intelligence",
    "/upload",
  ];
  for (const route of pages) {
    const page = await getText(`${BASE}${route}`);
    const broken =
      page.status !== 200 ||
      /Application error|This page couldn’t be rendered|Internal Server Error/i.test(page.text);
    assert(`page ${route}`, !broken, String(page.status));
  }

  const multi = await getJson(`${BASE}/api/multi/dataset`);
  const multiBody = multi.body as {
    products?: ProductMaster[];
    surface?: VolSurface;
    bookProductCount?: number;
  };
  const products = multiBody.products ?? [];
  const liveLegs = products.reduce((sum, item) => sum + (item.legs?.length ?? 0), 0);
  assert("multi dataset 200", multi.status === 200);
  assert(
    `multi dataset ${liveVolSeed.expiries.length} expiries`,
    multiBody.surface?.expiries?.length === liveVolSeed.expiries.length,
    String(multiBody.surface?.expiries?.length),
  );
  assert(
    "multi dataset fwd 6.6 percent",
    Math.abs((multiBody.surface?.pricingParams?.[0]?.fwdSellRate ?? 0) - 0.066) < 1e-9,
    String(multiBody.surface?.pricingParams?.[0]?.fwdSellRate),
  );
  assert(
    "multi live product count",
    products.length >= 2000 && products.length < MULTI_BOOK_PRODUCT_COUNT,
    String(products.length),
  );
  assert(
    "multi bookProductCount",
    multiBody.bookProductCount === MULTI_BOOK_PRODUCT_COUNT,
    String(multiBody.bookProductCount),
  );
  assert("multi live leg count finite", liveLegs > 50_000, String(liveLegs));
  const p1567 = products.find((p) => p.productName.includes("1567"));
  assert("multi book still includes 1567", Boolean(p1567), products[0]?.productName);

  const hist = await getJson(`${BASE}/api/market/index-at-date?date=${YESTERDAY}`);
  const histBody = hist.body as { niftyLevel?: number | null };
  assert("index-at-date 200", hist.status === 200);
  assert(
    `yahoo ${YESTERDAY} nifty finite`,
    typeof histBody.niftyLevel === "number" && histBody.niftyLevel > 0,
    String(histBody.niftyLevel),
  );

  const levels = await getJson(`${BASE}/api/market/levels`);
  const levelsBody = levels.body as { niftyLevel?: number | null; source?: string };
  assert("market levels 200", levels.status === 200);
  assert(
    "live nifty finite",
    typeof levelsBody.niftyLevel === "number" && levelsBody.niftyLevel > 0,
    String(levelsBody.niftyLevel),
  );

  const quotes = await fetch(`${BASE}/api/multi/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: p1567 ? [productKey(p1567)] : [] }),
  });
  const quotesBody = (await quotes.json()) as {
    unwindDate?: string;
    nifty?: number | null;
    quotes?: Record<string, { quoteRs?: number | null }>;
  };
  const liveQuote = Object.values(quotesBody.quotes ?? {})[0];
  assert("multi quotes 200", quotes.ok);
  assert("multi quotes date is today", Boolean(quotesBody.unwindDate && /^\d{4}-\d{2}-\d{2}$/.test(quotesBody.unwindDate)));
  assert(
    "multi quotes live rupee finite",
    typeof liveQuote?.quoteRs === "number" && Number.isFinite(liveQuote.quoteRs) && (liveQuote.quoteRs ?? 0) > 0,
    String(liveQuote?.quoteRs),
  );

  if (failures) process.exitCode = 1;
  else console.log("\nLive desk checks PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
