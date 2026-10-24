import { createInMemoryCounterStore, createRedisCounterStore } from "@/infrastructure/cache/counter-stores";

/** Runs the counter script's logic the way Redis would, so tests see real counts and TTLs. */
function fakeRedis(initial: Record<string, number> = {}) {
  const values = new Map<string, number>(Object.entries(initial));
  const ttls = new Map<string, number>();
  return {
    values,
    ttls,
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    eval: jest.fn(async (_script: string, keys: string[], args: string[]) =>
      keys.map((key, i) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        if (next === 1) ttls.set(key, Number(args[i]));
        return next;
      }),
    ),
  };
}

describe("createRedisCounterStore", () => {
  it("counts every window of a hit in ONE atomic command, setting each key's expiry with its first hit", async () => {
    const redis = fakeRedis();
    const store = createRedisCounterStore(redis);
    expect(
      await store.incrementMany([
        { key: "rl:minute", ttlSeconds: 120 },
        { key: "rl:day", ttlSeconds: 86_460 },
      ]),
    ).toEqual([1, 1]);
    expect(await store.incrementMany([{ key: "rl:minute", ttlSeconds: 120 }])).toEqual([2]);
    expect(redis.eval).toHaveBeenCalledTimes(2);
    // The expiry is set inside the same script as the INCR: a key can never be left without one.
    expect(redis.eval.mock.calls[0]?.[0]).toMatch(/INCR[\s\S]*EXPIRE/);
    expect(Object.fromEntries(redis.ttls)).toEqual({ "rl:minute": 120, "rl:day": 86_460 });
  });

  it("increments one key through the same script", async () => {
    const redis = fakeRedis({ k: 4 });
    expect(await createRedisCounterStore(redis).increment("k", 60)).toBe(5);
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for no keys", async () => {
    const redis = fakeRedis();
    expect(await createRedisCounterStore(redis).incrementMany([])).toEqual([]);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("reads a count without adding to it: 0 for a missing key", async () => {
    const redis = fakeRedis({ k: 3 });
    const store = createRedisCounterStore(redis);
    expect(await store.count("k")).toBe(3);
    expect(await store.count("missing")).toBe(0);
    expect(redis.eval).not.toHaveBeenCalled();
  });
});

describe("createInMemoryCounterStore", () => {
  it("counts several keys at once, each with its own expiry", async () => {
    const clock = { ms: 0 };
    const store = createInMemoryCounterStore(() => clock.ms);
    expect(
      await store.incrementMany([
        { key: "a", ttlSeconds: 60 },
        { key: "b", ttlSeconds: 600 },
      ]),
    ).toEqual([1, 1]);
    clock.ms += 60_000;
    expect(
      await store.incrementMany([
        { key: "a", ttlSeconds: 60 },
        { key: "b", ttlSeconds: 600 },
      ]),
    ).toEqual([1, 2]);
  });

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
