import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";

describe("createInMemoryRedis", () => {
  it("round-trips values through JSON and honors the TTL", async () => {
    const clock = { ms: 0 };
    const redis = createInMemoryRedis(() => clock.ms);
    const value = { a: 1, when: new Date(0) };
    await redis.set("k", value, { ex: 10 });

    expect(await redis.get("k")).toEqual({ a: 1, when: "1970-01-01T00:00:00.000Z" });
    clock.ms = 10_000;
    expect(await redis.get("k")).toBeNull();
  });

  it("reads many keys at once, in order, null for missing or expired ones", async () => {
    const clock = { ms: 0 };
    const redis = createInMemoryRedis(() => clock.ms);
    await redis.set("a", 1, { ex: 10 });
    await redis.set("b", { x: 2 }, { ex: 1 });
    clock.ms = 5_000;
    expect(await redis.mget(["a", "missing", "b"])).toEqual([1, null, null]);
    expect(await redis.mget([])).toEqual([]);
  });

  it("uses the real clock by default", async () => {
    const redis = createInMemoryRedis();
    await redis.set("k", "v", { ex: 60 });
    expect(await redis.get("k")).toBe("v");
    expect(await redis.get("missing")).toBeNull();
  });
});
