import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Returns an error
 * response to send back, or null when the request may proceed.
 */
export function rejectUnlessCron(request: NextRequest): NextResponse | null {
  const secret = env().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  return ok ? null : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
