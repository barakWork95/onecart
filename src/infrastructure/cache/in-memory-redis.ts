import type { RedisLike } from "@/infrastructure/cache/redis-client";

/**
 * Per-process stand-in for Upstash when it isn't configured (local dev, E2E).
 * Values are JSON round-tripped like Upstash so behavior matches production.
 */
export function createInMemoryRedis(now: () => number = Date.now): RedisLike {
  const entries = new Map<string, { json: string; expiresAtMs: number }>();
  return {
    async get<T>(key: string) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAtMs <= now()) {
        entries.delete(key);
        return null;
      }
      // Same contract as Upstash's generic get: the caller validates the shape.
      return JSON.parse(entry.json) as T;
    },
    async set(key, value, { ex }) {
      entries.set(key, { json: JSON.stringify(value), expiresAtMs: now() + ex * 1000 });
      return "OK";
    },
  };
}
