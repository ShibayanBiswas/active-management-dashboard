import { NextResponse } from "next/server";

import { readMultipartWorkbook } from "@/lib/api/read-upload-file";
import { guardWrite } from "@/lib/api/write-guard";
import { persistMultiProducts } from "@/lib/data/multi-load";
import { parseProductMasterBook } from "@/lib/workbook/parse-multi-master";
import { MAX_UPLOAD_BYTES, validateDeskUpload } from "@/lib/workbook/upload-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = guardWrite(req, MAX_UPLOAD_BYTES);
  if (blocked) return blocked;
  const uploaded = await readMultipartWorkbook(req);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error, issues: uploaded.issues }, { status: 400 });
  }
  if (uploaded.buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "Workbook too large",
        issues: [
          "This workbook is larger than 96 MB. Upload a Multiple Products workbook, not an unrelated archive.",
        ],
      },
      { status: 400 },
    );
  }

  const check = validateDeskUpload("product-master", uploaded.name, uploaded.buffer, "multi");
  if (!check.ok) {
    return NextResponse.json({ error: "Upload failed", issues: check.issues }, { status: 400 });
  }

  let products;
  const blanks: string[] = [];
  try {
    products = parseProductMasterBook(Buffer.from(uploaded.buffer), blanks);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    return NextResponse.json({ error: message, issues: [message] }, { status: 400 });
  }
  if (blanks.length) {
    return NextResponse.json(
      { error: "Product facts are blank", issues: ["Fill in these Product Master cells and upload again. The desk does not guess product facts.", ...blanks.slice(0, 25)] },
      { status: 400 },
    );
  }

  if (!products.length) {
    return NextResponse.json(
      {
        error: "No products found",
        issues: ["The Product Master needs at least one product with option legs."],
      },
      { status: 400 },
    );
  }

  try {
    const persisted = await persistMultiProducts(products, uploaded.name);
    return NextResponse.json({
      ok: true,
      products,
      product: products[0],
      summary: {
        productName: `${products.length} products`,
        productCode: products[0]?.productCode ?? "",
        legs: products.reduce((sum, item) => sum + item.legs.length, 0),
      },
      persisted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk database write failed";
    return NextResponse.json(
      { error: "The Product Master could not be saved.", issues: [message] },
      { status: 500 },
    );
  }
}
