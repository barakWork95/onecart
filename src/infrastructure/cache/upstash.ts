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
  return upstashRedisLike(
    new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
  );
}

/** Keys per MGET: keeps one request and its response small. */
const MGET_CHUNK = 100;

/** The slice of the Upstash client `upstashRedisLike` wraps. */
export interface UpstashClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
  mget(...keys: string[]): Promise<unknown[]>;
}

export function upstashRedisLike(client: UpstashClient): RedisLike {
  return {
    get: (key) => client.get(key),
    set: (key, value, options) => client.set(key, value, options),
    async mget<T>(keys: readonly string[]) {
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += MGET_CHUNK) chunks.push(keys.slice(i, i + MGET_CHUNK));
      const results = await Promise.all(chunks.map((chunk) => client.mget(...chunk)));
      return results.flat() as (T | null)[];
    },
  };
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
