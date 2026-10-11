import "server-only";

import { Redis } from "@upstash/redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Returns null when Upstash isn't configured; callers fall back to in-memory stores. */
export function createUpstashRedis(env: {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}): RedisLike | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}
