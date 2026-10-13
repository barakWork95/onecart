import { NextResponse, type NextRequest } from "next/server";
import { warmTrending } from "@/app/_composition";
import { rejectUnlessCron } from "@/app/api/cron/_auth";

/**
 * Daily: re-runs the homepage's trending searches so their results stay
 * cached for the "Trending" grid, which only ever reads the cache.
 */
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  return NextResponse.json({ warmed: await warmTrending() }, { headers: { "Cache-Control": "no-store" } });
}
