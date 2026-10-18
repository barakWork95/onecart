import { windowSlot } from "@/domain/security/rate-limit";
import type { QuotaReading, QuotaSource } from "@/domain/ops/status";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

export interface BudgetCounter {
  /** Shown on the status page, e.g. "Our eBay budget today". */
  readonly name: string;
  /** The rate limiter's key prefix ("budget", "budget-warm"). */
  readonly prefix: string;
  /** The store id the limiter counts under. */
  readonly subject: string;
  readonly limit: number;
}

const DAY = { name: "day", limit: 0, windowSeconds: 24 * 60 * 60 } as const;

/**
 * Our own daily call budgets, read straight from the counters the rate limiter
 * increments (a read never counts as a call).
 */
export function createBudgetQuota(config: {
  redis: RedisLike;
  budgets: readonly BudgetCounter[];
  now?: () => number;
}): QuotaSource {
  const now = config.now ?? Date.now;
  return {
    async read() {
      return Promise.all(
        config.budgets.map(async (b): Promise<QuotaReading> => {
          const at = now();
          const slot = windowSlot(b.prefix, b.subject, { ...DAY, limit: b.limit }, at);
          const resetsAt = new Date(at + slot.resetsInSeconds * 1000).toISOString();
          try {
            const raw = await config.redis.get<unknown>(slot.key);
            const used = typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
            return {
              name: b.name,
              used,
              limit: b.limit,
              remaining: Math.max(0, b.limit - used),
              resetsAt,
              error: null,
            };
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return { name: b.name, used: null, limit: b.limit, remaining: null, resetsAt, error: reason };
          }
        }),
      );
    },
  };
}
