import { createFailoverCounterStore, createFailoverRedis } from "@/infrastructure/cache/failover-redis";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import type { CounterStore } from "@/domain/security/ports";

const QUOTA = new Error("ERR max requests limit exceeded. Limit: 500000, Usage: 500000.");

function flakyRedis(): RedisLike & { failWith: Error | null; calls: number } {
  const inner = createInMemoryRedis();
  const state = {
    failWith: null as Error | null,
    calls: 0,
    async get<T>(key: string) {
      state.calls += 1;
      if (state.failWith) throw state.failWith;
      return inner.get<T>(key);
    },
    async mget<T>(keys: readonly string[]) {
      state.calls += 1;
      if (state.failWith) throw state.failWith;
      return inner.mget<T>(keys);
    },
    async set(key: string, value: unknown, options: { ex: number }) {
      state.calls += 1;
      if (state.failWith) throw state.failWith;
      return inner.set(key, value, options);
    },
  };
  return state;
}

describe("createFailoverRedis", () => {
  const setup = () => {
    const clock = { ms: 0 };
    const primary = flakyRedis();
    const logger = { warn: jest.fn() };
    const redis = createFailoverRedis({
      primary,
      fallback: createInMemoryRedis(() => clock.ms),
      now: () => clock.ms,
      logger,
    });
    return { clock, primary, logger, redis };
  };

  it("uses the primary while it works", async () => {
    const { primary, redis } = setup();
    await redis.set("k", 1, { ex: 60 });
    expect(await redis.get("k")).toBe(1);
    expect(await redis.mget(["k", "x"])).toEqual([1, null]);
    expect(primary.calls).toBe(3);
  });

  it("on an exhausted quota, stops calling Upstash for 15 minutes and serves from memory instead", async () => {
    const { clock, primary, logger, redis } = setup();
    primary.failWith = QUOTA;
    // The failing call itself is answered from memory: callers never see the error.
    await expect(redis.set("k", "v", { ex: 3600 })).resolves.toBeDefined();
    expect(await redis.get("k")).toBe("v");
    expect(await redis.mget(["k"])).toEqual(["v"]);
    expect(primary.calls).toBe(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    clock.ms += 15 * 60_000;
    primary.failWith = null;
    expect(await redis.get("k")).toBeNull(); // back on Upstash, which never got the write
    expect(primary.calls).toBe(2);
  });

  it("backs off for 30 seconds on any other failure (network, timeout)", async () => {
    const { clock, primary, redis } = setup();
    primary.failWith = new Error("fetch failed");
    expect(await redis.get("k")).toBeNull();
    expect(await redis.get("k")).toBeNull();
    expect(primary.calls).toBe(1);
    clock.ms += 30_000;
    primary.failWith = null;
    await redis.get("k");
    expect(primary.calls).toBe(2);
  });
});

describe("createFailoverCounterStore", () => {
  it("keeps counting in memory while Upstash is out, so limits and budgets still hold", async () => {
    const clock = { ms: 0 };
    let fail = false;
    const primary: CounterStore = {
      increment: async () => {
        if (fail) throw QUOTA;
        return 1;
      },
      count: async () => 0,
    };
    const store = createFailoverCounterStore({ primary, now: () => clock.ms, logger: { warn: jest.fn() } });
    expect(await store.increment("k", 60)).toBe(1);
    fail = true;
    expect(await store.increment("k", 60)).toBe(1);
    expect(await store.increment("k", 60)).toBe(2);
    expect(await store.count("k")).toBe(2);
  });
});
