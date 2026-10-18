import { NextResponse, type NextRequest } from "next/server";
import { checkOpsAlerts, recordCronRun } from "@/app/_composition";
import { notifyTriggeredAlerts, priceAlertChecker } from "@/app/_user-lists";
import { rejectUnlessCron } from "@/app/api/cron/_auth";
import { alertRunProblems } from "@/domain/ops/cron-run";

/** Daily price-alert run (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  const check = priceAlertChecker();
  if (!check) return NextResponse.json({ error: "no alert storage configured" }, { status: 503 });
  const { result, run } = await recordCronRun(
    "price-alerts",
    async () => {
      const summary = await check();
      // After the check has saved today's triggers: push them (and retry earlier failures).
      const notifications = await notifyTriggeredAlerts();
      return { ...summary, notifications };
    },
    alertRunProblems,
  );
  // Also catches a missed warm-trending run: a cron that didn't run can't report itself.
  const alerts = await checkOpsAlerts();
  return NextResponse.json(
    { ...result, ok: run.ok, problems: run.problems, alerts },
    { headers: { "Cache-Control": "no-store" } },
  );
}
