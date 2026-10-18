import type { IsoDateTime } from "@/domain/product/unified-product";

export const CRON_JOBS = ["warm-trending", "price-alerts"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

/** One cron run as the status page and alerts see it. */
export interface CronRun {
  readonly job: CronJob;
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime;
  /** No problems: a run that completed but found trouble is not ok. */
  readonly ok: boolean;
  /** Plain-language problems, e.g. "aliexpress: 40 of 65 searches failed". Empty when ok. */
  readonly problems: readonly string[];
}

/** A job's latest run and its latest ok one (null if it hasn't succeeded within retention). */
export interface CronJobHistory {
  readonly last: CronRun;
  readonly lastOk: CronRun | null;
}

/** What the warm-up reports per search (see `warmTrendingSearches`). */
export interface WarmedSearch {
  readonly query: string;
  readonly outcomes: readonly { readonly provider: string; readonly status: string }[];
}

export interface WarmRunResult {
  readonly trending: readonly WarmedSearch[];
  readonly categories: readonly WarmedSearch[];
  readonly priceHistory: unknown;
}

const FAILED = new Set(["timeout", "error", "circuit_open"]);
/** A store failing at least this share of its searches is a problem; a stray timeout isn't. */
export const STORE_FAILURE_SHARE = 0.5;

/** Problems in a warm-up run: stores mostly failing, price history erroring. */
export function warmRunProblems(result: WarmRunResult): string[] {
  const byStore = new Map<string, { failed: number; total: number }>();
  for (const { outcomes } of [...result.trending, ...result.categories]) {
    for (const { provider, status } of outcomes) {
      const tally = byStore.get(provider) ?? { failed: 0, total: 0 };
      byStore.set(provider, { failed: tally.failed + (FAILED.has(status) ? 1 : 0), total: tally.total + 1 });
    }
  }
  const problems = [...byStore]
    .filter(([, t]) => t.failed > 0 && t.failed / t.total >= STORE_FAILURE_SHARE)
    .map(([store, t]) =>
      t.failed === t.total
        ? `${store}: all ${t.total} searches failed`
        : `${store}: ${t.failed} of ${t.total} searches failed`,
    );
  if (result.priceHistory === "error") problems.push("price history: recording failed");
  return problems;
}

/** What the price-alerts cron reports (see `checkPriceAlerts` and `notifyTriggeredAlerts`). */
export interface AlertRunResult {
  readonly checked: number;
  readonly failedSearches: number;
  readonly notifications: unknown;
}

function isNotificationSummary(value: unknown): value is { sent: number; failed: number; alerts: number } {
  return (
    typeof value === "object" && value !== null && "sent" in value && "failed" in value && "alerts" in value
  );
}

/** Problems in a price-alerts run: searches failing, notifications erroring or all failing. */
export function alertRunProblems(result: AlertRunResult): string[] {
  const problems: string[] = [];
  if (result.failedSearches > 0) problems.push(`price alerts: ${result.failedSearches} searches failed`);
  if (result.notifications === "error") problems.push("notifications: the run failed");
  else if (
    isNotificationSummary(result.notifications) &&
    result.notifications.failed > 0 &&
    result.notifications.sent === 0
  )
    problems.push(`notifications: all ${result.notifications.failed} pushes failed`);
  return problems;
}

/** Jobs are daily: one not finished within this long missed a run. */
export const MAX_RUN_AGE_HOURS = 26;

/** Jobs whose last run is older than `MAX_RUN_AGE_HOURS`, or that never ran. */
export function staleJobs(
  history: Readonly<Partial<Record<CronJob, CronJobHistory>>>,
  nowMs: number,
  jobs: readonly CronJob[] = CRON_JOBS,
): CronJob[] {
  return jobs.filter((job) => {
    const last = history[job]?.last;
    return !last || nowMs - Date.parse(last.finishedAt) > MAX_RUN_AGE_HOURS * 60 * 60 * 1000;
  });
}
