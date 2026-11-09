import { NextResponse } from "next/server";

import { readMultipartWorkbook } from "@/lib/api/read-upload-file";
import { guardWrite } from "@/lib/api/write-guard";
import { persistActiveSurface, presentSurfaceForDeskMonth } from "@/lib/data/load";
import { normalizeVolSurface } from "@/lib/engine/vol-surface";
import { parseVolSurfaceWorkbook } from "@/lib/workbook/parsers";
import { currentUploadMonthKey, MAX_UPLOAD_BYTES, validateDeskUpload } from "@/lib/workbook/upload-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = guardWrite(req, MAX_UPLOAD_BYTES);
  if (blocked) return blocked;
  const uploaded = await readMultipartWorkbook(req);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error, issues: uploaded.issues }, { status: 400 });
  }

  const monthKey = uploaded.monthKey || currentUploadMonthKey();
  const check = validateDeskUpload("vol-surface", uploaded.name, uploaded.buffer);
  if (!check.ok) {
    return NextResponse.json({ error: check.issues[0], issues: check.issues }, { status: 400 });
  }

  let surface;
  try {
    surface = parseVolSurfaceWorkbook(uploaded.buffer, monthKey);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse failed", issues: [e instanceof Error ? e.message : "Parse failed"] },
      { status: 400 },
    );
  }

  const saved = normalizeVolSurface(surface);
  try {
    const persisted = await persistActiveSurface(saved, uploaded.name);
    // Shown with the month's reference prices, the closes on or before the 1st, as every later load shows it.
    return NextResponse.json({ ok: true, surface: await presentSurfaceForDeskMonth(saved), summary: check.summary, persisted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Desk database write failed";
    return NextResponse.json(
      { error: "The Volatility Surface could not be saved.", issues: [message] },
      { status: 500 },
    );
  }
}
