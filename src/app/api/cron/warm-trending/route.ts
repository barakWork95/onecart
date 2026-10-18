import { NextResponse, type NextRequest } from "next/server";
import { checkOpsAlerts, recordCronRun, warmTrending } from "@/app/_composition";
import { rejectUnlessCron } from "@/app/api/cron/_auth";
import { warmRunProblems } from "@/domain/ops/cron-run";

/**
 * Daily: re-runs the homepage's trending and category searches so their
 * results stay cached, records prices, and records how the run went.
 */
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  const { result, run } = await recordCronRun("warm-trending", warmTrending, warmRunProblems);
  // Also catches a missed price-alerts run: a cron that didn't run can't report itself.
  const alerts = await checkOpsAlerts();
  return NextResponse.json(
    { warmed: result, ok: run.ok, problems: run.problems, alerts },
    { headers: { "Cache-Control": "no-store" } },
  );
}
