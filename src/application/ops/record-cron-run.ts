import type { CronJob, CronRun } from "@/domain/ops/cron-run";
import type { OpsStore } from "@/domain/ops/ports";
import { noopLogger, type Logger } from "@/domain/shared/logger";

export interface RecordCronRunDeps {
  readonly store: OpsStore;
  readonly now?: () => Date;
  readonly logger?: Logger;
}

/**
 * Runs a cron's work and records how it went: ok, the problems it reported,
 * or that it threw (rethrown after recording). Recording itself never fails
 * the cron: a store outage is logged.
 */
export function createRecordCronRun(deps: RecordCronRunDeps) {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? noopLogger;

  async function save(run: CronRun) {
    try {
      await deps.store.recordRun(run);
    } catch (error) {
      logger.warn("ops: recording a cron run failed", {
        job: run.job,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return async function recordCronRun<T>(
    job: CronJob,
    work: () => Promise<T>,
    problemsOf: (result: T) => readonly string[],
  ): Promise<{ readonly result: T; readonly run: CronRun }> {
    const startedAt = now().toISOString();
    let result: T;
    try {
      result = await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await save({
        job,
        startedAt,
        finishedAt: now().toISOString(),
        ok: false,
        problems: [`the run threw: ${message}`],
      });
      throw error;
    }
    const problems = [...problemsOf(result)];
    const run: CronRun = {
      job,
      startedAt,
      finishedAt: now().toISOString(),
      ok: problems.length === 0,
      problems,
    };
    await save(run);
    return { result, run };
  };
}
