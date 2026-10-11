import type { CachedProviderResult } from "@/domain/search/ports";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { createRedisSearchCache } from "@/infrastructure/cache/redis-search-cache";
import { makeProduct } from "@/test/product-factory";

function fakeRedis(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const redis: RedisLike & { set: jest.Mock } = {
    get: async <T>(key: string) => (store.get(key) ?? null) as T | null,
    set: jest.fn(async (key: string, value: unknown) => {
      // Mirror Upstash: values round-trip through JSON.
      store.set(key, JSON.parse(JSON.stringify(value)));
      return "OK";
    }),
  };
  return redis;
}

const entry: CachedProviderResult = { products: [makeProduct()], cachedAt: "2026-10-11T09:00:00.000Z" };

describe("createRedisSearchCache", () => {
  it("round-trips an entry and sets the TTL in seconds", async () => {
    const redis = fakeRedis();
    const cache = createRedisSearchCache(redis);
    await cache.set("k", entry, 86_400);
    expect(redis.set).toHaveBeenCalledWith("k", entry, { ex: 86_400 });
    expect(await cache.get("k")).toEqual(entry);
  });

  it("returns null on a miss", async () => {
    expect(await createRedisSearchCache(fakeRedis()).get("missing")).toBeNull();
  });

  it("caches and returns an empty product list", async () => {
    const cache = createRedisSearchCache(fakeRedis());
    await cache.set("k", { products: [], cachedAt: entry.cachedAt }, 60);
    expect(await cache.get("k")).toEqual({ products: [], cachedAt: entry.cachedAt });
  });

  it.each([
    ["a string", "garbage"],
    ["null-ish object", { products: null, cachedAt: "x" }],
    ["missing cachedAt", { products: [] }],
    ["products of the wrong shape", { products: [{ foo: 1 }], cachedAt: "x" }],
    ["products containing null", { products: [null], cachedAt: "x" }],
  ])("treats %s as a miss", async (_label, value) => {
    expect(await createRedisSearchCache(fakeRedis({ k: value })).get("k")).toBeNull();
  });

  it("propagates Redis errors so the use case can log and fall back", async () => {
    const redis: RedisLike = {
      get: () => Promise.reject(new Error("ECONNRESET")),
      set: () => Promise.reject(new Error("ECONNRESET")),
    };
    await expect(createRedisSearchCache(redis).get("k")).rejects.toThrow("ECONNRESET");
  });
});
