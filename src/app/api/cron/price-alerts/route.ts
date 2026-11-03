import { amazonLinkOnly, env } from "@/config/env";
import { NextResponse, type NextRequest } from "next/server";
import { checkOpsAlerts, recordCronRun } from "@/app/_composition";
import { notifyTriggeredAlerts, priceAlertChecker } from "@/app/_user-lists";
import { rejectUnlessCron } from "@/app/api/cron/_auth";
import { alertRunProblems } from "@/domain/ops/cron-run";

/** Daily price-alert run (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  if (amazonLinkOnly(env())) {
    const paused = { checked: 0, failedSearches: 0, notifications: "paused" };
    await recordCronRun("price-alerts", async () => paused, alertRunProblems);
    return NextResponse.json(
      { ok: true, paused: true, reason: "amazon_interim_mode" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
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
