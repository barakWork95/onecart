import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { MEMORY_CACHED_PREFIXES, withMemoryCache } from "@/infrastructure/cache/memory-cache";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

function spiedRedis() {
  const inner = createInMemoryRedis();
  const get = jest.spyOn(inner, "get");
  const mget = jest.spyOn(inner, "mget");
  const set = jest.spyOn(inner, "set");
  return { inner: inner as RedisLike, get, mget, set };
}

describe("withMemoryCache", () => {
  const setup = (options: { ttlMs?: number; maxEntries?: number } = {}) => {
    const clock = { ms: 0 };
    const spied = spiedRedis();
    const redis = withMemoryCache(spied.inner, { now: () => clock.ms, ...options });
    return { clock, redis, ...spied };
  };

  it("answers repeat reads of a read-only key from memory for a minute", async () => {
    const { clock, redis, get } = setup();
    await redis.set("search:v3:IL:ebay:jbl flip 6", { products: [] }, { ex: 3600 });
    get.mockClear();
    expect(await redis.get("search:v3:IL:ebay:jbl flip 6")).toEqual({ products: [] });
    expect(await redis.get("search:v3:IL:ebay:jbl flip 6")).toEqual({ products: [] });
    expect(get).not.toHaveBeenCalled(); // the write filled memory
    clock.ms += 60_000;
    await redis.get("search:v3:IL:ebay:jbl flip 6");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("never remembers a miss: the next read asks Redis again (another instance may have written it)", async () => {
    const { redis, get } = setup();
    expect(await redis.get("translate:v1:he-en:אוזניות")).toBeNull();
    expect(await redis.get("translate:v1:he-en:אוזניות")).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("asks Redis only for the keys it doesn't hold, in one MGET, and keeps the caller's order", async () => {
    const { redis, inner, mget } = setup();
    await inner.set("img:dhash:v1:a", "aaaa", { ex: 60 });
    await inner.set("img:dhash:v1:b", "bbbb", { ex: 60 });
    await redis.get("img:dhash:v1:a");
    expect(await redis.mget(["img:dhash:v1:b", "img:dhash:v1:a", "img:dhash:v1:missing"])).toEqual([
      "bbbb",
      "aaaa",
      null,
    ]);
    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget).toHaveBeenCalledWith(["img:dhash:v1:b", "img:dhash:v1:missing"]);
    mget.mockClear();
    expect(await redis.mget(["img:dhash:v1:a", "img:dhash:v1:b"])).toEqual(["aaaa", "bbbb"]);
    expect(mget).not.toHaveBeenCalled();
  });

  it("never caches shared state: counters, circuit breakers, ops state and anything unlisted pass straight through", async () => {
    const { redis, inner, get, mget } = setup();
    for (const key of [
      "circuit:v1:ebay",
      "rl:search:minute:1.1.1.1:1",
      "budget:day:ebay:1",
      "lock:admin:x",
      "ops:cron:v1:warm",
      "deals:price-drops:v1",
      "fx:v1:to-ils",
    ]) {
      await inner.set(key, 1, { ex: 60 });
      await redis.get(key);
      await redis.get(key);
      await redis.mget([key]);
      await redis.mget([key]);
    }
    expect(get).toHaveBeenCalledTimes(14);
    expect(mget).toHaveBeenCalledTimes(14);
    expect(MEMORY_CACHED_PREFIXES).toEqual(["search:", "translate:", "img:dhash:", "aff:aliexpress:"]);
  });

  it("writes through to Redis", async () => {
    const { redis, set } = setup();
    await redis.set("aff:aliexpress:v1:onecart:https://x", "https://s.click", { ex: 60 });
    expect(set).toHaveBeenCalledWith("aff:aliexpress:v1:onecart:https://x", "https://s.click", { ex: 60 });
  });

  it("stays bounded: the least recently used entry goes first", async () => {
    const { redis, get } = setup({ maxEntries: 2 });
    await redis.set("search:a", 1, { ex: 60 });
    await redis.set("search:b", 2, { ex: 60 });
    await redis.get("search:a"); // a is now the most recent
    await redis.set("search:c", 3, { ex: 60 }); // evicts b
    get.mockClear();
    await redis.get("search:a");
    await redis.get("search:c");
    expect(get).not.toHaveBeenCalled();
    await redis.get("search:b");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("returns copies, so a caller mutating a result can't change what the next caller reads", async () => {
    const { redis } = setup();
    await redis.set("search:x", { products: [1] }, { ex: 60 });
    const first = await redis.get<{ products: number[] }>("search:x");
    first?.products.push(2);
    expect(await redis.get("search:x")).toEqual({ products: [1] });
  });
});
