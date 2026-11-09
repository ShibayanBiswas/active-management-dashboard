import { NextResponse } from "next/server";

import { fetchIndexAtDate } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }
  try {
    const levels = await fetchIndexAtDate(date);
    return NextResponse.json({ date, ...levels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Index lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
