import { createInMemoryCounterStore, createRedisCounterStore } from "@/infrastructure/cache/counter-stores";

describe("createRedisCounterStore", () => {
  it("increments and starts the expiry on the first hit only", async () => {
    let value = 0;
    const redis = { incr: jest.fn(async () => ++value), expire: jest.fn(async () => 1) };
    const store = createRedisCounterStore(redis);
    expect(await store.increment("k", 120)).toBe(1);
    expect(await store.increment("k", 120)).toBe(2);
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith("k", 120);
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

  it("sweeps expired keys when it grows large", async () => {
    const clock = { ms: 0 };
    const store = createInMemoryCounterStore(() => clock.ms);
    for (let i = 0; i < 10_001; i++) await store.increment(`old-${i}`, 1);
    clock.ms += 2_000;
    expect(await store.increment("new", 60)).toBe(1);
    expect(await store.increment("old-0", 60)).toBe(1);
  });
});
