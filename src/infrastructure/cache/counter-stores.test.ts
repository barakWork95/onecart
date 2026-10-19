import { createInMemoryCounterStore, createRedisCounterStore } from "@/infrastructure/cache/counter-stores";

describe("createRedisCounterStore", () => {
  it("increments and starts the expiry on the first hit only", async () => {
    let value = 0;
    const redis = { incr: jest.fn(async () => ++value), expire: jest.fn(async () => 1), get: jest.fn() };
    const store = createRedisCounterStore(redis);
    expect(await store.increment("k", 120)).toBe(1);
    expect(await store.increment("k", 120)).toBe(2);
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith("k", 120);
  });

  it("reads a count without adding to it: 0 for a missing key", async () => {
    const values = new Map<string, unknown>([["k", 3]]);
    const redis = {
      incr: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(async (key: string) => values.get(key) ?? null),
    };
    const store = createRedisCounterStore(redis);
    expect(await store.count("k")).toBe(3);
    expect(await store.count("missing")).toBe(0);
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe("createInMemoryCounterStore", () => {
  it("counts per key and restarts after the key expires", async () => {
    const clock = { ms: 0 };
    const store = createInMemoryCounterStore(() => clock.ms);
    expect(await store.increment("a", 60)).toBe(1);
    expect(await store.increment("a", 60)).toBe(2);
    expect(await store.increment("b", 60)).toBe(1);
    clock.ms += 60_000;
    expect(await store.increment("a", 60)).toBe(1);
  });

  it("reads a count without adding to it, and 0 once the key expired", async () => {
    const clock = { ms: 0 };
    const store = createInMemoryCounterStore(() => clock.ms);
    await store.increment("a", 60);
    await store.increment("a", 60);
    expect(await store.count("a")).toBe(2);
    expect(await store.count("a")).toBe(2);
    expect(await store.count("b")).toBe(0);
    clock.ms += 60_000;
    expect(await store.count("a")).toBe(0);
  });

  it("sweeps expired keys when it grows large", async () => {
    const clock = { ms: 0 };
    const store = createInMemoryCounterStore(() => clock.ms);
    for (let i = 0; i < 10_001; i++) await store.increment(`old-${i}`, 1);
    clock.ms += 2_000;
    expect(await store.increment("new", 60)).toBe(1);
    expect(await store.increment("old-0", 60)).toBe(1);
  });
});
