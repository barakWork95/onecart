import type { CounterStore } from "@/domain/security/ports";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import { createInMemoryCounterStore } from "@/infrastructure/cache/counter-stores";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Upstash's answer once the plan's monthly commands are used up. */
const QUOTA_ERROR = /max (daily |monthly )?requests? limit exceeded|limit exceeded/i;
/** Off Upstash this long after a quota error: the limit won't lift within minutes. */
export const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
/** …and this long after any other failure (network, timeout). */
export const ERROR_COOLDOWN_MS = 30 * 1000;

interface FailoverDeps<T> {
  readonly primary: T;
  readonly fallback?: T;
  readonly now?: () => number;
  readonly logger?: Logger;
}

/**
 * Runs each call on the primary unless it recently failed, then on the
 * fallback: the failing call itself is answered by the fallback too, so callers
 * never see an Upstash outage or an exhausted quota. Per instance, by design.
 */
function failover<T>(name: string, deps: FailoverDeps<T> & { readonly fallback: T }) {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;
  let downUntil = 0;
  return async function run<R>(call: (store: T) => Promise<R>): Promise<R> {
    if (now() < downUntil) return call(deps.fallback);
    try {
      return await call(deps.primary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quota = QUOTA_ERROR.test(message);
      downUntil = now() + (quota ? QUOTA_COOLDOWN_MS : ERROR_COOLDOWN_MS);
      logger.warn(`${name}: Upstash unavailable, using memory`, {
        reason: quota ? "quota_exhausted" : "error",
        error: message,
        retryInSeconds: (downUntil - now()) / 1000,
      });
      return call(deps.fallback);
    }
  };
}

/** Upstash with an in-memory stand-in while it's out (see `failover`). */
export function createFailoverRedis(deps: FailoverDeps<RedisLike>): RedisLike {
  const run = failover("redis", { ...deps, fallback: deps.fallback ?? createInMemoryRedis(deps.now) });
  return {
    get: (key) => run((r) => r.get(key)),
    mget: (keys) => run((r) => r.mget(keys)),
    set: (key, value, options) => run((r) => r.set(key, value, options)),
  };
}

/** Rate-limit and budget counters that keep counting in memory while Upstash is out. */
export function createFailoverCounterStore(deps: FailoverDeps<CounterStore>): CounterStore {
  const run = failover("counters", {
    ...deps,
    fallback: deps.fallback ?? createInMemoryCounterStore(deps.now),
  });
  return {
    increment: (key, ttl) => run((c) => c.increment(key, ttl)),
    count: (key) => run((c) => c.count(key)),
  };
}
