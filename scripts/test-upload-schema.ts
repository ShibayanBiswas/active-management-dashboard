import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

import { asMoneyness, parseProductMasterWorkbook, parseVolSurfaceWorkbook } from "../lib/workbook/parsers";
import {
  MAX_UPLOAD_BYTES,
  productMasterDeskMismatch,
  validateDeskUpload,
  validateProductMasterWorkbook,
  validateUploadFileName,
  validateVolSurfaceWorkbook,
  volSurfaceSampleFileName,
} from "../lib/workbook/upload-schema";
import volSeed from "../lib/data/vol-surface-seed.json";

const VOL_SAMPLE = `public/samples/${volSurfaceSampleFileName()}`;
import { MULTI_BOOK_LEG_COUNT, MULTI_BOOK_PRODUCT_COUNT } from "../lib/multi/book-stats";

function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function toBuffer(file: Buffer): ArrayBuffer {
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

async function extraExpiryAndPercent(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(VOL_SAMPLE);
  const ws = wb.getWorksheet("Vol Surface");
  if (!ws) throw new Error("Vol Surface sheet missing");

  let headRow = -1;
  for (let r = 1; r <= 40; r += 1) {
    const label = String(ws.getCell(r, 1).value ?? "").toLowerCase();
    if (label.includes("strike change")) {
      headRow = r;
      break;
    }
  }
  if (headRow < 0) throw new Error("Strike Change row missing");

  const lastCol = ws.columnCount;
  const newCol = lastCol + 1;
  ws.getCell(headRow, newCol).value = 1.6;
  ws.getCell(headRow, newCol).numFmt = "0%";

  let expiryHeader = headRow;
  for (let r = headRow; r <= headRow + 6; r += 1) {
    if (String(ws.getCell(r, 1).value ?? "").toLowerCase().includes("expiry")) {
      expiryHeader = r;
      break;
    }
  }
  const lastRow = ws.rowCount;
  for (let r = expiryHeader + 1; r <= lastRow; r += 1) {
    if (ws.getCell(r, 1).value) ws.getCell(r, newCol).value = 12.5;
  }
  const newRow = lastRow + 1;
  ws.getCell(newRow, 1).value = new Date(Date.UTC(2031, 6, 31));
  for (let c = 2; c <= newCol; c += 1) ws.getCell(newRow, c).value = 11.25;
  const out = path.join("tmp-upload-variant.xlsx");
  await wb.xlsx.writeFile(out);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return toBuffer(buf);
}

async function missingStrikeChange(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vol Surface");
  ws.getCell(1, 1).value = "Not A Surface";
  const out = path.join("tmp-upload-bad.xlsx");
  await wb.xlsx.writeFile(out);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return toBuffer(buf);
}

/** 961 sample with chosen product-fact cells cleared (matched by header label). */
async function productWithBlankFacts(headers: string[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx");
  for (const ws of wb.worksheets) {
    ws.eachRow((row, r) => {
      row.eachCell((cell, c) => {
        if (!headers.includes(String(cell.value ?? "").trim())) return;
        for (let below = r + 1; below <= ws.rowCount; below += 1) ws.getCell(below, c).value = null;
      });
    });
  }
  const out = path.join("tmp-upload-blank-facts.xlsx");
  await wb.xlsx.writeFile(out);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return toBuffer(buf);
}

async function maybeE2e(volBuf: ArrayBuffer, productBuf: ArrayBuffer) {
  const base = "http://localhost:3006";
  try {
    const ping = await fetch(`${base}/api/multi/dataset`);
    if (!ping.ok) {
      console.log("SKIP e2e: dataset not ready");
      return;
    }
  } catch {
    console.log("SKIP e2e: dev server not running on 3006");
    return;
  }

  async function post(kind: "vol-surface" | "product-master", fileName: string, body: Buffer, extra?: Record<string, string>) {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(body)], fileName));
    if (extra) {
      for (const [k, v] of Object.entries(extra)) form.append(k, v);
    }
    const route = kind === "vol-surface" ? "/api/uploads/vol-surface" : "/api/multi/uploads/product-master";
    return fetch(`${base}${route}`, { method: "POST", body: form });
  }

  const volFile = Buffer.from(volBuf);
  const productFile = Buffer.from(productBuf);

  const okVol = await post("vol-surface", volSurfaceSampleFileName(), volFile, { monthKey: "2026-08" });
  const okVolJson = await okVol.json();
  assert("e2e vol sample 200", okVol.ok, JSON.stringify(okVolJson.issues ?? okVolJson.error ?? okVol.status));
  assert("e2e vol expiries", (okVolJson.summary?.expiries ?? 0) >= 1);

  const datasetAfterVol = await (await fetch(`${base}/api/multi/dataset`)).json();
  assert(
    "e2e home dataset reflects vol",
    Array.isArray(datasetAfterVol.surface?.expiries) && datasetAfterVol.surface.expiries.length === okVolJson.summary.expiries,
    String(datasetAfterVol.surface?.expiries?.length),
  );

  const cross = await post("vol-surface", "Product_Master_Input_Nifty_Accelerator_961.xlsx", productFile, {
    monthKey: "2026-08",
  });
  assert("e2e product as vol 400", cross.status === 400);

  const txt = await post("vol-surface", "notes.txt", Buffer.from("hello"), { monthKey: "2026-08" });
  assert("e2e txt as vol 400", txt.status === 400);

  const jsonBody = await fetch(`${base}/api/uploads/vol-surface`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const jsonBodyText = await jsonBody.text();
  let jsonBodyPayload: { issues?: string[] } = {};
  try {
    jsonBodyPayload = JSON.parse(jsonBodyText) as { issues?: string[] };
  } catch {
    jsonBodyPayload = {};
  }
  assert(
    "e2e json body 400 not 500",
    jsonBody.status === 400 && Boolean(jsonBodyPayload.issues?.length),
    `${jsonBody.status} ${jsonBodyText.slice(0, 120)}`,
  );

  const multiWrong = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products.xlsx");
  const multiOkForm = new FormData();
  multiOkForm.append(
    "file",
    new File([new Uint8Array(multiWrong)], "Product_Master_Input_Multiple_Products.xlsx"),
  );
  const multiOkRes = await fetch(`${base}/api/multi/uploads/product-master`, {
    method: "POST",
    body: multiOkForm,
  });
  const multiOkText = await multiOkRes.text();
  let multiOkJson: { productCount?: number; legCount?: number; error?: string } = {};
  try {
    multiOkJson = JSON.parse(multiOkText) as typeof multiOkJson;
  } catch {
    multiOkJson = {};
  }
  assert("e2e multi sample upload 200", multiOkRes.ok, `${multiOkRes.status} ${multiOkText.slice(0, 160)}`);
  const multiDataset = await (await fetch(`${base}/api/multi/dataset?scope=full`)).json();
  const multiLegs = Array.isArray(multiDataset.products)
    ? multiDataset.products.reduce(
        (sum: number, product: { legs?: unknown[] }) => sum + (product.legs?.length ?? 0),
        0,
      )
    : 0;
  assert("e2e multi dataset product count", multiDataset.products?.length === MULTI_BOOK_PRODUCT_COUNT, String(multiDataset.products?.length));
  assert("e2e multi dataset leg count", multiLegs === MULTI_BOOK_LEG_COUNT, String(multiLegs));
  assert(
    "e2e multi dataset no zero qty",
    Array.isArray(multiDataset.products) &&
      multiDataset.products.every((product: { legs?: { reqQuantity?: number }[] }) =>
        (product.legs ?? []).every((leg) => (leg.reqQuantity ?? 0) !== 0),
      ),
  );

  const multiRepeated = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx");
  const multiRepeatedForm = new FormData();
  multiRepeatedForm.append(
    "file",
    new File([new Uint8Array(multiRepeated)], "Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"),
  );
  const multiRepeatedRes = await fetch(`${base}/api/multi/uploads/product-master`, {
    method: "POST",
    body: multiRepeatedForm,
  });
  assert("e2e multi repeated-row upload 200", multiRepeatedRes.ok, String(multiRepeatedRes.status));

  const singleOnMultiForm = new FormData();
  singleOnMultiForm.append(
    "file",
    new File([new Uint8Array(productFile)], "Product_Master_Input_Nifty_Accelerator_961.xlsx"),
  );
  const singleOnMultiRes = await fetch(`${base}/api/multi/uploads/product-master`, {
    method: "POST",
    body: singleOnMultiForm,
  });
  assert("e2e 961 rejected on multi desk", singleOnMultiRes.status === 400, String(singleOnMultiRes.status));

  const pages = await Promise.all(
    [
      "/",
      "/upload",
      "/portfolio/unwinding",
      "/portfolio/pricer",
      "/intelligence",
    ].map(async (p) => {
      const res = await fetch(`${base}${p}`);
      return { p, ok: res.ok };
    }),
  );
  for (const page of pages) assert(`e2e page ${page.p}`, page.ok);
}

async function main() {
  const volFile = fs.readFileSync(VOL_SAMPLE);
  const productFile = fs.readFileSync("public/samples/Product_Master_Input_Nifty_Accelerator_961.xlsx");
  const volBuf = toBuffer(volFile);
  const productBuf = toBuffer(productFile);

  assert("asMoneyness fraction 1.5", asMoneyness(1.5) === 1.5);
  assert("asMoneyness integer 150", asMoneyness(150) === 1.5);
  assert("asMoneyness integer 100", asMoneyness(100) === 1);
  assert("xlsx name ok", validateUploadFileName("book.xlsx") == null);
  assert("xlsm name ok", validateUploadFileName("book.xlsm") == null);
  assert("txt name rejected", validateUploadFileName("book.txt") != null);
  const oversize = validateDeskUpload("vol-surface", "huge.xlsx", new ArrayBuffer(MAX_UPLOAD_BYTES + 1));
  assert("oversize workbook rejected", !oversize.ok, !oversize.ok ? oversize.issues[0] : "accepted");

  const volOk = validateVolSurfaceWorkbook(volBuf);
  assert(
    "sample vol schema",
    volOk.ok,
    volOk.ok && volOk.kind === "vol-surface" ? `${volOk.summary.expiries} expiries` : !volOk.ok ? volOk.issues.join(" | ") : "wrong kind",
  );
  if (volOk.ok && volOk.kind === "vol-surface") {
    assert("sample vol percents variable allowed", volOk.summary.strikePercents.length >= 1);
  }

  const pmOk = validateProductMasterWorkbook(productBuf);
  assert(
    "sample product schema",
    pmOk.ok,
    pmOk.ok && pmOk.kind === "product-master" ? `${pmOk.summary.legs} legs` : !pmOk.ok ? pmOk.issues.join(" | ") : "wrong kind",
  );
  if (pmOk.ok && pmOk.kind === "product-master") {
    assert("sample product 24 legs", pmOk.summary.legs === 24, String(pmOk.summary.legs));
    assert("sample product count 1", pmOk.summary.productCount === 1, String(pmOk.summary.productCount));
  }

  const multiFile = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products.xlsx");
  const multiBuf = toBuffer(multiFile);
  const multiOk = validateProductMasterWorkbook(multiBuf);
  assert(
    "multi sample product schema",
    multiOk.ok && multiOk.kind === "product-master",
    multiOk.ok && multiOk.kind === "product-master" ? `${multiOk.summary.legs} legs` : !multiOk.ok ? multiOk.issues.join(" | ") : "wrong kind",
  );
  if (multiOk.ok && multiOk.kind === "product-master") {
    assert("multi sample leg count", multiOk.summary.legs === MULTI_BOOK_LEG_COUNT, String(multiOk.summary.legs));
    assert("multi sample product count", multiOk.summary.productCount === MULTI_BOOK_PRODUCT_COUNT, String(multiOk.summary.productCount));
  }

  assert(
    "filename multi on single desk",
    productMasterDeskMismatch("Product_Master_Input_Multiple_Products.xlsx", "single") != null,
  );
  assert(
    "filename 961 on multi desk",
    productMasterDeskMismatch("Product_Master_Input_Nifty_Accelerator_961.xlsx", "multi") != null,
  );
  assert(
    "filename 961 on single desk",
    productMasterDeskMismatch("Product_Master_Input_Nifty_Accelerator_961.xlsx", "single") == null,
  );

  const multiOnSingle = validateDeskUpload(
    "product-master",
    "Product_Master_Input_Multiple_Products.xlsx",
    multiBuf,
    "single",
  );
  assert("multi sample rejected on single desk", !multiOnSingle.ok, !multiOnSingle.ok ? multiOnSingle.issues[0] : "accepted");

  const multiOnMulti = validateDeskUpload(
    "product-master",
    "Product_Master_Input_Multiple_Products.xlsx",
    multiBuf,
    "multi",
  );
  assert("multi sample accepted on multi desk", multiOnMulti.ok, multiOnMulti.ok ? undefined : multiOnMulti.issues.join(" | "));

  const multiRepeatedFile = fs.readFileSync("public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx");
  const multiRepeatedBuf = toBuffer(multiRepeatedFile);
  const multiRepeatedOk = validateProductMasterWorkbook(multiRepeatedBuf);
  assert(
    "multi repeated sample product schema",
    multiRepeatedOk.ok && multiRepeatedOk.kind === "product-master",
    multiRepeatedOk.ok && multiRepeatedOk.kind === "product-master"
      ? `${multiRepeatedOk.summary.legs} legs`
      : !multiRepeatedOk.ok
        ? multiRepeatedOk.issues.join(" | ")
        : "wrong kind",
  );
  if (multiRepeatedOk.ok && multiRepeatedOk.kind === "product-master") {
    assert("multi repeated sample leg count", multiRepeatedOk.summary.legs === MULTI_BOOK_LEG_COUNT, String(multiRepeatedOk.summary.legs));
    assert("multi repeated sample product count", multiRepeatedOk.summary.productCount === MULTI_BOOK_PRODUCT_COUNT, String(multiRepeatedOk.summary.productCount));
  }
  const multiRepeatedOnMulti = validateDeskUpload(
    "product-master",
    "Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx",
    multiRepeatedBuf,
    "multi",
  );
  assert(
    "multi repeated sample accepted on multi desk",
    multiRepeatedOnMulti.ok,
    multiRepeatedOnMulti.ok ? undefined : multiRepeatedOnMulti.issues.join(" | "),
  );

  const singleOnMulti = validateDeskUpload(
    "product-master",
    "Product_Master_Input_Nifty_Accelerator_961.xlsx",
    productBuf,
    "multi",
  );
  assert("961 sample rejected on multi desk", !singleOnMulti.ok, !singleOnMulti.ok ? singleOnMulti.issues[0] : "accepted");

  const renamedMulti = validateDeskUpload("product-master", "book.xlsx", multiBuf, "single");
  assert(
    "renamed multi book rejected on single desk",
    !renamedMulti.ok,
    !renamedMulti.ok ? renamedMulti.issues[0] : "accepted",
  );

  const crossVol = validateDeskUpload("vol-surface", "Product_Master_Input.xlsx", productBuf);
  assert("product rejected as vol", !crossVol.ok);

  const crossPm = validateDeskUpload("product-master", "Vol_Surface.xlsx", volBuf);
  assert("vol rejected as product", !crossPm.ok);

  const variant = await extraExpiryAndPercent();
  const variantOk = validateVolSurfaceWorkbook(variant);
  assert("extra expiry and percent accepted", variantOk.ok, variantOk.ok ? undefined : variantOk.issues.join(" | "));
  if (variantOk.ok) {
    const parsed = parseVolSurfaceWorkbook(variant, "2026-08");
    assert("variant has extra percent", parsed.moneyness.includes(1.6), parsed.moneyness.slice(-3).join(","));
    assert("variant has extra expiry", parsed.expiries.length > volSeed.expiries.length, String(parsed.expiries.length));
  }

  const bad = await missingStrikeChange();
  const badOk = validateVolSurfaceWorkbook(bad);
  assert("missing strike change rejected", !badOk.ok);

  // A blank valuation fact is reported, never parsed as product 961's value; a blank tenor is derived.
  const blankIssues: string[] = [];
  const blankParsed = parseProductMasterWorkbook(await productWithBlankFacts(["Initial Underlying Level", "Tenor Days"]), blankIssues);
  assert(
    "blank Initial Underlying Level is reported for upload",
    blankIssues.length === 1 && blankIssues[0]!.includes("Initial Underlying Level"),
    blankIssues.join(" | "),
  );
  const derivedTenor = Math.round(
    (Date.parse(blankParsed.maturityDate) - Date.parse(blankParsed.allotmentDate)) / 86_400_000,
  );
  assert("blank Tenor Days is the allotment-to-maturity span", blankParsed.tenorDays === derivedTenor, String(blankParsed.tenorDays));
  const cleanIssues: string[] = [];
  parseProductMasterWorkbook(productBuf, cleanIssues);
  assert("the 961 sample has every valuation fact", cleanIssues.length === 0, cleanIssues.join(" | "));

  await maybeE2e(volBuf, productBuf);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
