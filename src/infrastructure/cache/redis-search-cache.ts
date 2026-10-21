import type { CachedProviderResult, SearchResultCache } from "@/domain/search/ports";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/**
 * Cheap structural check: entries we didn't write (or wrote under an older
 * shape that slipped past a key-version bump) are treated as a miss rather
 * than crashing the results page.
 */
function isCachedProviderResult(value: unknown): value is CachedProviderResult {
  if (typeof value !== "object" || value === null) return false;
  const { products, cachedAt } = value as Record<string, unknown>;
  return (
    typeof cachedAt === "string" &&
    Array.isArray(products) &&
    products.every(
      (p: unknown) =>
        typeof p === "object" && p !== null && "id" in p && "price" in p && "provider" in p && "title" in p,
    )
  );
}

export function createRedisSearchCache(redis: RedisLike): SearchResultCache {
  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return isCachedProviderResult(value) ? value : null;
    },
    async getMany(keys) {
      const values = await redis.mget<unknown>(keys);
      return values.map((value) => (isCachedProviderResult(value) ? value : null));
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}
