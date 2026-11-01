import { CRON_JOBS, staleJobs, type CronJob, type CronJobHistory } from "@/domain/ops/cron-run";
import { isExhausted, isNearlyExhausted, type QuotaReading } from "@/domain/ops/status";

const count = (n: number) => n.toLocaleString("en-US");

/** Something ops should hear about. `key` is stable while the issue lasts. */
export interface OpsIssue {
  readonly key: string;
  readonly message: string;
}

/**
 * Everything wrong right now: failing last runs, missed runs, quotas at zero,
 * quotas past their warning share, and quotas whose read failure means an outage.
 */
export function currentIssues(
  history: Readonly<Partial<Record<CronJob, CronJobHistory>>>,
  quotas: readonly QuotaReading[],
  nowMs: number,
): OpsIssue[] {
  const issues: OpsIssue[] = [];
  for (const job of CRON_JOBS) {
    const last = history[job]?.last;
    if (last && !last.ok) issues.push({ key: `run:${job}`, message: `${job}: ${last.problems.join("; ")}` });
  }
  // A job with no record yet (just deployed) shows as "never ran" on the page but doesn't
  // alert: only a recorded run that's gone stale means a missed run.
  for (const job of staleJobs(history, nowMs).filter((j) => history[j]))
    issues.push({ key: `stale:${job}`, message: `${job} hasn't run in over a day` });
  for (const q of quotas.filter(isExhausted))
    issues.push({ key: `quota:${q.name}`, message: `${q.name}: none left` });
  for (const q of quotas) {
    if (!isNearlyExhausted(q) || q.used === null || q.limit === null) continue;
    const share = Math.floor((q.used / q.limit) * 100);
    issues.push({
      key: `quota-near:${q.name}`,
      message: `${q.name}: ${share}% used (${count(q.used)} of ${count(q.limit)})`,
    });
  }
  for (const q of quotas.filter((q) => q.alertOnError && q.error))
    issues.push({ key: `quota-error:${q.name}`, message: `${q.name}: ${q.error}` });
  return issues;
}

/**
 * What changed since last time: new issues (alert) and cleared ones (say it
 * recovered). An issue that persists stays quiet: one alert per occurrence.
 */
export function diffIssues(
  previous: readonly OpsIssue[],
  current: readonly OpsIssue[],
): { readonly raised: OpsIssue[]; readonly resolved: OpsIssue[] } {
  const before = new Set(previous.map((i) => i.key));
  const now = new Set(current.map((i) => i.key));
  return {
    raised: current.filter((i) => !before.has(i.key)),
    resolved: previous.filter((i) => !now.has(i.key)),
  };
}
