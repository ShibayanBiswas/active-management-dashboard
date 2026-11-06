import { NextResponse } from "next/server";
import { z } from "zod";

import { loadDeskData } from "@/lib/data/load";
import { defaultInputs } from "@/lib/desk-defaults";
import { computeBook } from "@/lib/engine/book";
import { summaryRecord } from "@/lib/summary-record";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z
  .object({
    valuationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currentNifty: z.number().positive(),
    assumedNifty: z.number().positive(),
    forwardRate: z.number(),
    discountSpread: z.number(),
    deltaRate: z.number(),
    scenarioMode: z.enum(["delta", "full"]),
  })
  .partial();

/** Book Summary for the given inputs (anything omitted takes the desk default). */
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Inputs", issues: parsed.error.issues }, { status: 400 });
  const data = await loadDeskData();
  const inputs = { ...defaultInputs(data.asOf), ...parsed.data };
  const book = computeBook(data, inputs);
  return NextResponse.json({ inputs, source: data.source, totals: book.totals, products: book.rows.map(summaryRecord) });
}
