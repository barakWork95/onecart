import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { priceAlertChecker } from "@/app/_user-lists";
import { env } from "@/config/env";

function authorized(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily price-alert run (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const check = priceAlertChecker();
  if (!check) return NextResponse.json({ error: "no alert storage configured" }, { status: 503 });
  return NextResponse.json(await check(), { headers: { "Cache-Control": "no-store" } });
}
