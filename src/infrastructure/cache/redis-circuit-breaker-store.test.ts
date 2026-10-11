import type { RedisLike } from "@/infrastructure/cache/redis-client";
import {
  circuitKey,
  createRedisCircuitBreakerStore,
} from "@/infrastructure/cache/redis-circuit-breaker-store";

function fakeRedis(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const redis: RedisLike & { set: jest.Mock } = {
    get: async <T>(key: string) => (store.get(key) ?? null) as T | null,
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
  };
  return redis;
}

describe("createRedisCircuitBreakerStore", () => {
  it("stores state per provider with a self-expiring TTL", async () => {
    const redis = fakeRedis();
    const store = createRedisCircuitBreakerStore(redis);
    await store.set("temu", { status: "open", openedAtMs: 123 });

    expect(redis.set).toHaveBeenCalledWith(
      "circuit:v1:temu",
      { status: "open", openedAtMs: 123 },
      { ex: 3_600 },
    );
    expect(await store.get("temu")).toEqual({ status: "open", openedAtMs: 123 });
    expect(await store.get("ebay")).toBeNull();
  });

  it("reads closed state", async () => {
    const store = createRedisCircuitBreakerStore(
      fakeRedis({ [circuitKey("ebay")]: { status: "closed", consecutiveFailures: 2 } }),
    );
    expect(await store.get("ebay")).toEqual({ status: "closed", consecutiveFailures: 2 });
  });

  it.each([
    ["a string", "open"],
    ["null", null],
    ["unknown status", { status: "half_open" }],
    ["open without a timestamp", { status: "open" }],
    ["closed without a count", { status: "closed" }],
  ])("treats %s as no state", async (_label, value) => {
    expect(
      await createRedisCircuitBreakerStore(fakeRedis({ [circuitKey("ebay")]: value })).get("ebay"),
    ).toBeNull();
  });
});
