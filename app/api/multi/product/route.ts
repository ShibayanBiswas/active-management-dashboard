import { NextResponse } from "next/server";

import { looksLikeProduct, toPlainProduct } from "@/lib/data/load";
import { persistMultiProduct } from "@/lib/data/multi-load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!looksLikeProduct(body)) {
      return NextResponse.json(
        {
          error: "Product Master is incomplete",
          issues: ["Keep the product name, product code and every option leg before saving."],
        },
        { status: 400 },
      );
    }
    const product = toPlainProduct(body);
    const persisted = await persistMultiProduct(product, "desk-edit");
    return NextResponse.json({ ok: true, product, persisted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk database write failed";
    return NextResponse.json(
      {
        error: "The Product Master could not be saved.",
        issues: [message],
      },
      { status: 500 },
    );
  }
}
