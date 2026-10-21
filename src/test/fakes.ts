import type { CircuitState } from "@/domain/search/circuit-breaker";
import type { CachedProviderResult, CircuitBreakerStore, SearchResultCache } from "@/domain/search/ports";
import type { ProviderId } from "@/domain/shared/provider";
import type { UserListsRepository } from "@/domain/user-lists/ports";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { SavedItem } from "@/domain/user-lists/product-snapshot";

/**
 * Port fakes for application-layer tests. Deliberately separate from the
 * infrastructure in-memory stores: application tests must not depend on
 * infrastructure (see the layer rules in CLAUDE.md).
 */
export function fakeSearchCache(now: () => number): SearchResultCache {
  const entries = new Map<string, { value: CachedProviderResult; expiresAtMs: number }>();
  const get = (key: string) => {
    const entry = entries.get(key);
    return entry && entry.expiresAtMs > now() ? entry.value : null;
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

export function fakeCircuitBreakerStore(): CircuitBreakerStore {
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

/**
 * Minimal UserListsRepository for application tests (not the infrastructure
 * in-memory store — application tests must not depend on infrastructure).
 */
export function fakeUserListsRepository(): UserListsRepository {
  const saved = new Map<string, SavedItem>();
  const alerts = new Map<string, PriceAlert>();
  return {
    listSaved: async () => [...saved.values()],
    save: async (snapshot) => {
      const item = { ...snapshot, id: `s-${snapshot.productId}`, savedAt: "2026-10-11T00:00:00.000Z" };
      saved.set(snapshot.productId, item);
      return item;
    },
    removeSaved: async (productId) => {
      saved.delete(productId);
    },
    listAlerts: async () => [...alerts.values()],
    upsertAlert: async ({ price, ...snapshot }, target) => {
      const alert = {
        ...snapshot,
        id: `a-${snapshot.productId}`,
        target,
        baseline: price,
        lastSeen: price,
        lastCheckedAt: null,
        status: "active" as const,
        triggeredAt: null,
        createdAt: "2026-10-11T00:00:00.000Z",
      };
      alerts.set(snapshot.productId, alert);
      return alert;
    },
    deleteAlert: async (productId) => {
      alerts.delete(productId);
    },
  };
}
