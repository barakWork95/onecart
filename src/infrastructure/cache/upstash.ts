import "server-only";

import { Redis } from "@upstash/redis";
import type { CounterStore } from "@/domain/security/ports";
import { createRedisCounterStore } from "@/infrastructure/cache/counter-stores";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Returns null when Upstash isn't configured; callers fall back to in-memory stores. */
export function createUpstashRedis(env: {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}): RedisLike | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

/** Shared rate-limit counters on the same Upstash database, or null when it isn't configured. */
export function createUpstashCounterStore(env: {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}): CounterStore | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return createRedisCounterStore(
    new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
  );
}
