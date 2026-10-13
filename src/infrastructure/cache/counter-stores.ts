import type { CounterStore } from "@/domain/security/ports";

/** The slice of `@upstash/redis` the counter needs, so tests can pass a fake. */
export interface RedisCounterClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Shared counters in Redis: every instance sees the same counts, so a
 * crawler can't dodge the limit by landing on a fresh serverless instance.
 */
export function createRedisCounterStore(redis: RedisCounterClient): CounterStore {
  return {
    async increment(key, ttlSeconds) {
      const count = await redis.incr(key);
      // First hit in the window starts its clock.
      if (count === 1) await redis.expire(key, ttlSeconds);
      return count;
    },
  };
}

/** Per-process counters for local runs without Upstash. Expired keys are swept as they're touched. */
export function createInMemoryCounterStore(now: () => number = Date.now): CounterStore {
  const counts = new Map<string, { count: number; expiresAtMs: number }>();
  return {
    async increment(key, ttlSeconds) {
      const at = now();
      const entry = counts.get(key);
      if (!entry || entry.expiresAtMs <= at) {
        // Bounded memory under a flood of distinct keys: drop expired entries now and then.
        if (counts.size > 10_000) for (const [k, v] of counts) if (v.expiresAtMs <= at) counts.delete(k);
        counts.set(key, { count: 1, expiresAtMs: at + ttlSeconds * 1000 });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
  };
}
