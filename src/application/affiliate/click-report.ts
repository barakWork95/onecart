import { summarizeClicks, type ClickSummary } from "@/domain/affiliate/click-stats";
import type { ClickStatsReader } from "@/domain/affiliate/ports";

/** Clicks are counted by the Israeli calendar day, the market OneCart serves. */
const REPORT_TIME_ZONE = "Asia/Jerusalem";

export interface ClickReport extends ClickSummary {
  /** First day covered, `YYYY-MM-DD` (Israel time). */
  readonly sinceDay: string;
  readonly days: ClickSummary["days"];
}

/** `YYYY-MM-DD` of `date` in Israel; en-CA formats dates in ISO order. */
export function israelDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface ClickReportDeps {
  readonly stats: ClickStatsReader;
  readonly now?: () => Date;
}

/** Clicks per store and per day for the last `days` Israeli days, today included. */
export function createClickReport(deps: ClickReportDeps) {
  const now = deps.now ?? (() => new Date());
  return async function clickReport(days: number): Promise<ClickReport> {
    const today = now();
    // Noon UTC steps whole calendar days without landing on a DST edge.
    const start = new Date(`${israelDay(today)}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (Math.max(1, Math.floor(days)) - 1));
    const sinceDay = israelDay(start);
    return { sinceDay, ...summarizeClicks(await deps.stats.dailyClicks(sinceDay)) };
  };
}
