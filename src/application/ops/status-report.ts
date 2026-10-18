import { israelDay } from "@/application/affiliate/click-report";
import type { ClickStatsReader } from "@/domain/affiliate/ports";
import { CRON_JOBS, staleJobs, type CronJob, type CronJobHistory, type CronRun } from "@/domain/ops/cron-run";
import { currentIssues, type OpsIssue } from "@/domain/ops/issues";
import type { OpsStore } from "@/domain/ops/ports";
import type { OpsStats, PushStats, QuotaReading, QuotaSource } from "@/domain/ops/status";
import type { IsoDateTime } from "@/domain/product/unified-product";

/** Reads every quota source; a source that throws anyway becomes one error reading. */
export async function readQuotas(sources: readonly QuotaSource[]): Promise<QuotaReading[]> {
  const readings = await Promise.all(
    sources.map((s) =>
      s.read().catch((error: unknown): QuotaReading[] => [
        {
          name: "quota source",
          used: null,
          limit: null,
          remaining: null,
          resetsAt: null,
          error: error instanceof Error ? error.message : String(error),
        },
      ]),
    ),
  );
  return readings.flat();
}

/** A section that's not configured here, failed to load, or loaded. */
export type Section<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "not_configured" }
  | { readonly kind: "error"; readonly message: string };

async function section<T>(load: (() => Promise<T>) | null): Promise<Section<T>> {
  if (!load) return { kind: "not_configured" };
  try {
    return { kind: "ok", value: await load() };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export interface StatusReport {
  readonly generatedAt: IsoDateTime;
  readonly issues: readonly OpsIssue[];
  readonly jobs: readonly {
    readonly job: CronJob;
    readonly last: CronRun | null;
    readonly lastOk: CronRun | null;
    readonly stale: boolean;
  }[];
  readonly quotas: readonly QuotaReading[];
  /** Price rows recorded per Israeli day, newest first. */
  readonly prices: Section<readonly { day: string; count: number }[]>;
  readonly push: Section<PushStats>;
  readonly clicksToday: Section<{ readonly clicks: number; readonly affiliated: number }>;
}

export interface StatusReportDeps {
  readonly ops: OpsStore;
  readonly quotas: readonly QuotaSource[];
  /** Null without Supabase's service key. */
  readonly stats: OpsStats | null;
  readonly clicks: ClickStatsReader | null;
  readonly now?: () => Date;
}

/** Days shown in the price-recording table. */
const PRICE_DAYS = 14;

/** Everything `/internal/status` shows. Each section fails on its own. */
export function createStatusReport(deps: StatusReportDeps) {
  const now = deps.now ?? (() => new Date());
  return async function statusReport(): Promise<StatusReport> {
    const at = now();
    const today = israelDay(at);
    const days = Array.from({ length: PRICE_DAYS }, (_, i) =>
      israelDay(new Date(at.getTime() - i * 86_400_000)),
    );
    const { stats, clicks } = deps;
    const [history, quotas, prices, push, clicksToday] = await Promise.all([
      deps.ops.history().catch((): Partial<Record<CronJob, CronJobHistory>> => ({})),
      readQuotas(deps.quotas),
      section(stats ? () => stats.priceObservationsByDay(days) : null),
      section(stats ? () => stats.push() : null),
      section(
        clicks
          ? async () => {
              const rows = await clicks.dailyClicks(today);
              return {
                clicks: rows.reduce((n, r) => n + r.clicks, 0),
                affiliated: rows.reduce((n, r) => n + r.affiliated, 0),
              };
            }
          : null,
      ),
    ]);
    const stale = new Set(staleJobs(history, at.getTime()));
    return {
      generatedAt: at.toISOString(),
      issues: currentIssues(history, quotas, at.getTime()),
      jobs: CRON_JOBS.map((job) => ({
        job,
        last: history[job]?.last ?? null,
        lastOk: history[job]?.lastOk ?? null,
        stale: stale.has(job),
      })),
      quotas,
      prices,
      push,
      clicksToday,
    };
  };
}
