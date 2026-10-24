import type { CounterSlot, CounterStore } from "@/domain/security/ports";

/** The slice of `@upstash/redis` the counter needs, so tests can pass a fake. */
export interface RedisCounterClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  get(key: string): Promise<unknown>;
}

/**
 * INCR each key, and start its expiry on its first hit, in one atomic script:
 * one round trip for every window of a hit, and no key is ever left without
 * an expiry (as a separate EXPIRE that failed after its INCR would leave it).
 */
export const INCR_WITH_EXPIRY = `local out = {}
for i, key in ipairs(KEYS) do
  local count = redis.call("INCR", key)
  if count == 1 then redis.call("EXPIRE", key, tonumber(ARGV[i])) end
  out[i] = count
end
return out`;

/**
 * Shared counters in Redis: every instance sees the same counts, so a
 * crawler can't dodge the limit by landing on a fresh serverless instance.
 */
export function createRedisCounterStore(redis: RedisCounterClient): CounterStore {
  async function incrementMany(slots: readonly CounterSlot[]) {
    if (slots.length === 0) return [];
    const counts = await redis.eval(
      INCR_WITH_EXPIRY,
      slots.map((s) => s.key),
      slots.map((s) => String(s.ttlSeconds)),
    );
    if (!Array.isArray(counts) || counts.length !== slots.length)
      throw new Error("counter: unexpected reply");
    return counts.map(Number);
  }
  return {
    incrementMany,
    async increment(key, ttlSeconds) {
      const [count] = await incrementMany([{ key, ttlSeconds }]);
      return count!;
    },
    async count(key) {
      const value = Number(await redis.get(key));
      return Number.isFinite(value) ? value : 0;
    },
  };
}

/** Per-process counters for local runs without Upstash. Expired keys are swept as they're touched. */
export function createInMemoryCounterStore(now: () => number = Date.now): CounterStore {
  const counts = new Map<string, { count: number; expiresAtMs: number }>();
  const store: CounterStore = {
    async incrementMany(slots) {
      const out: number[] = [];
      for (const { key, ttlSeconds } of slots) out.push(await store.increment(key, ttlSeconds));
      return out;
    },
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
    async count(key) {
      const entry = counts.get(key);
      return entry && entry.expiresAtMs > now() ? entry.count : 0;
    },
  };
  return store;
}
