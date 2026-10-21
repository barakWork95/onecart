import type { CircuitState } from "@/domain/search/circuit-breaker";
import type { CachedProviderResult, CircuitBreakerStore, SearchResultCache } from "@/domain/search/ports";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Per-process fallbacks used when Redis isn't configured (local dev) and in
 * tests. In serverless production they only live as long as one instance.
 */
export function createInMemorySearchCache(now: () => number = Date.now): SearchResultCache {
  const entries = new Map<string, { value: CachedProviderResult; expiresAtMs: number }>();
  const get = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= now()) {
      entries.delete(key);
      return null;
    }
    return entry.value;
  };
  return {
    async get(key) {
      return get(key);
    },
    async getMany(keys) {
      return keys.map(get);
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAtMs: now() + ttlSeconds * 1000 });
    },
  };
}

export function createInMemoryCircuitBreakerStore(): CircuitBreakerStore {
  const states = new Map<ProviderId, CircuitState>();
  return {
    async get(provider) {
      return states.get(provider) ?? null;
    },
    async set(provider, state) {
      states.set(provider, state);
    },
  };
}
