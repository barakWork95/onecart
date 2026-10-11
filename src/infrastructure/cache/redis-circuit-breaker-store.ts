import type { CircuitState } from "@/domain/search/circuit-breaker";
import type { CircuitBreakerStore } from "@/domain/search/ports";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** State expires on its own so a forgotten open circuit can't block a provider forever. */
const STATE_TTL_SECONDS = 60 * 60;

export const circuitKey = (provider: string) => `circuit:v1:${provider}`;

function isCircuitState(value: unknown): value is CircuitState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === "closed" && typeof v.consecutiveFailures === "number") ||
    (v.status === "open" && typeof v.openedAtMs === "number")
  );
}

/**
 * Shared across server instances via Redis. Updates are read-modify-write, so
 * concurrent failures can under-count by a few — acceptable for a breaker
 * whose job is to stop hammering a dead API, not to count precisely.
 */
export function createRedisCircuitBreakerStore(redis: RedisLike): CircuitBreakerStore {
  return {
    async get(provider) {
      const value = await redis.get<unknown>(circuitKey(provider));
      return isCircuitState(value) ? value : null;
    },
    async set(provider, state) {
      await redis.set(circuitKey(provider), state, { ex: STATE_TTL_SECONDS });
    },
  };
}
