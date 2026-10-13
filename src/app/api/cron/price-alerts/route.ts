import { NextResponse, type NextRequest } from "next/server";
import { priceAlertChecker } from "@/app/_user-lists";
import { rejectUnlessCron } from "@/app/api/cron/_auth";

/** Daily price-alert run (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  const check = priceAlertChecker();
  if (!check) return NextResponse.json({ error: "no alert storage configured" }, { status: 503 });
  return NextResponse.json(await check(), { headers: { "Cache-Control": "no-store" } });
}
