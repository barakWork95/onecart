import { z } from "zod";
import { CRON_JOBS, type CronJob, type CronJobHistory, type CronRun } from "@/domain/ops/cron-run";
import type { OpsStore } from "@/domain/ops/ports";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Bump the version when `CronJobHistory` changes shape. */
export const opsRunKey = (job: CronJob) => `ops:cron:v1:${job}`;
/** Long enough to show "last ok" after a bad week; daily jobs overwrite it anyway. */
const TTL_SECONDS = 30 * 24 * 60 * 60;

const runSchema = z.object({
  job: z.enum(CRON_JOBS),
  startedAt: z.string(),
  finishedAt: z.string(),
  ok: z.boolean(),
  problems: z.array(z.string()),
});
const historySchema = z.object({ last: runSchema, lastOk: runSchema.nullable() });

/** Each job's latest run and latest ok run, one Redis key per job. */
export function createRedisOpsStore(redis: RedisLike): OpsStore {
  async function read(job: CronJob): Promise<CronJobHistory | null> {
    const parsed = historySchema.safeParse(await redis.get<unknown>(opsRunKey(job)));
    return parsed.success ? parsed.data : null;
  }
  return {
    async recordRun(run: CronRun) {
      const previous = await read(run.job);
      const history: CronJobHistory = { last: run, lastOk: run.ok ? run : (previous?.lastOk ?? null) };
      await redis.set(opsRunKey(run.job), history, { ex: TTL_SECONDS });
    },
    async history() {
      const entries = await Promise.all(CRON_JOBS.map(async (job) => [job, await read(job)] as const));
      return Object.fromEntries(entries.filter(([, h]) => h !== null));
    },
  };
}
