import { z } from "zod";
import type { OpsAlertState } from "@/domain/ops/ports";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

export const OPS_ISSUES_KEY = "ops:alerts:issues:v1";
export const OPS_TARGETS_KEY = "ops:alerts:targets:v1";
/** Re-armed by every cron run; a quiet month forgets resolved state harmlessly. */
const ISSUES_TTL = 30 * 24 * 60 * 60;
/** Admin browsers: kept a year, refreshed whenever re-saved. */
const TARGETS_TTL = 365 * 24 * 60 * 60;
/** A few admin browsers at most. */
const MAX_TARGETS = 5;

const issuesSchema = z.array(z.object({ key: z.string(), message: z.string() }));
const targetsSchema = z.array(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }));

/** Ops alert state in Redis: what's been alerted, and where alerts go. */
export function createRedisOpsAlertState(redis: RedisLike): OpsAlertState {
  async function targets() {
    const parsed = targetsSchema.safeParse(await redis.get<unknown>(OPS_TARGETS_KEY));
    return parsed.success ? parsed.data : [];
  }
  return {
    async activeIssues() {
      const parsed = issuesSchema.safeParse(await redis.get<unknown>(OPS_ISSUES_KEY));
      return parsed.success ? parsed.data : [];
    },
    async saveActiveIssues(issues) {
      await redis.set(OPS_ISSUES_KEY, issues, { ex: ISSUES_TTL });
    },
    targets,
    async addTarget(subscription) {
      const others = (await targets()).filter((t) => t.endpoint !== subscription.endpoint);
      const next = [
        { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
        ...others,
      ];
      await redis.set(OPS_TARGETS_KEY, next.slice(0, MAX_TARGETS), { ex: TARGETS_TTL });
    },
    async removeTarget(endpoint) {
      await redis.set(
        OPS_TARGETS_KEY,
        (await targets()).filter((t) => t.endpoint !== endpoint),
        { ex: TARGETS_TTL },
      );
    },
  };
}
