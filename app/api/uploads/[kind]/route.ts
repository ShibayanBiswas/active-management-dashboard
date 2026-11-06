import { NextResponse } from "next/server";

import { istTimestamp } from "@/lib/dates";
import { COLLECTIONS, getDb } from "@/lib/db/mongo";
import { parseProductMaster } from "@/lib/workbook/parse-master";
import { parseFixings, parseOptionChain, parseSurface } from "@/lib/workbook/parse-market";
import { readUploadSheets, toIso } from "@/lib/workbook/sheet-reader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const KINDS = new Set(["surface", "master", "chain", "fixings"]);
const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Parse an upload and, when the file is clean and Mongo is reachable, make it the active desk data. A dry run
 * (form field dryRun=1) only parses. DESK_WRITE_KEY, when set, must match the form field deskKey.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Unknown Upload" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach A File" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File Is Larger Than 40 MB" }, { status: 413 });
  const dryRun = form?.get("dryRun") === "1";
  const deskKey = process.env.DESK_WRITE_KEY;
  if (!dryRun && deskKey && form?.get("deskKey") !== deskKey) return NextResponse.json({ error: "Desk Key Required To Save" }, { status: 401 });

  let sheets;
  try {
    sheets = await readUploadSheets(file);
  } catch {
    return NextResponse.json({ error: "The File Could Not Be Read As A Workbook Or CSV" }, { status: 422 });
  }

  let summary: Record<string, unknown> = {};
  let issues: string[] = [];
  let write: ((db: NonNullable<Awaited<ReturnType<typeof getDb>>>) => Promise<unknown>) | null = null;

  if (kind === "master") {
    const parsed = parseProductMaster(sheets);
    issues = parsed.issues.map((i) => (i.row ? `Row ${i.row}: ${i.message}` : i.message));
    summary = { products: parsed.products.length, legs: parsed.products.reduce((s, p) => s + p.legs.length, 0) };
    if (parsed.products.length) {
      write = async (db) => {
        const col = db.collection(COLLECTIONS.products);
        await col.deleteMany({});
        await col.insertMany(parsed.products.map((p, order) => ({ ...p, order })));
      };
    }
  } else if (kind === "surface") {
    const label = String(form?.get("label") || file.name.replace(/\.[^.]+$/, ""));
    const parsed = parseSurface(sheets, label);
    issues = parsed.issues;
    summary = { expiries: parsed.surface?.expiries.length ?? 0, columns: parsed.surface?.moneyness.length ?? 0, referenceLevel: parsed.surface?.referenceLevel ?? null, spreads: parsed.bidAsk.length };
    if (parsed.surface) {
      const doc = { ...parsed.surface, ...(parsed.bidAsk.length ? { bidAsk: parsed.bidAsk } : {}) };
      write = async (db) => {
        const col = db.collection(COLLECTIONS.volSurfaces);
        const previous = await col.findOne({ active: true }, { projection: { bidAsk: 1 } });
        await col.updateMany({ active: true }, { $set: { active: false } });
        await col.insertOne({ bidAsk: previous?.bidAsk, ...doc, active: true, uploadedAt: istTimestamp() });
      };
    }
  } else if (kind === "chain") {
    const expiry = toIso(String(form?.get("expiry") ?? "")) ?? toIso(file.name.match(/(\d{1,2}-[A-Za-z]{3}-\d{4})/)?.[1] ?? null);
    const parsed = parseOptionChain(sheets);
    issues = expiry ? parsed.issues : ["Expiry Date Required: Enter It Or Keep It In The File Name", ...parsed.issues];
    summary = { expiry, strikes: parsed.rows.length };
    if (expiry && parsed.rows.length) {
      write = (db) =>
        db.collection(COLLECTIONS.optionChains).updateOne({ month: expiry.slice(0, 7) }, { $set: { month: expiry.slice(0, 7), expiry, rows: parsed.rows } }, { upsert: true });
    }
  } else {
    const parsed = parseFixings(sheets);
    issues = parsed.issues;
    summary = { fixings: parsed.fixings.length, from: parsed.fixings[0]?.date ?? null, to: parsed.fixings.at(-1)?.date ?? null };
    if (parsed.fixings.length) {
      write = (db) =>
        db.collection(COLLECTIONS.fixings).bulkWrite(
          parsed.fixings.map((f) => ({ updateOne: { filter: { date: f.date }, update: { $set: { ...f, source: "upload" } }, upsert: true } })),
        );
    }
  }

  const blocking = !write;
  let saved = false;
  let saveNote: string | null = null;
  if (!dryRun && write) {
    const db = await getDb();
    if (!db) saveNote = "Database Not Connected: Parsed Only, Nothing Saved";
    else {
      await write(db);
      await db.collection(COLLECTIONS.uploadLogs).insertOne({ kind, fileName: file.name, summary, issues: issues.slice(0, 50), at: istTimestamp() });
      saved = true;
    }
  }
  return NextResponse.json({ kind, fileName: file.name, summary, issues, saved, saveNote }, { status: blocking ? 422 : 200 });
}
