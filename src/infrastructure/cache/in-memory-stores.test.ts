import {
  createInMemoryCircuitBreakerStore,
  createInMemorySearchCache,
} from "@/infrastructure/cache/in-memory-stores";

describe("createInMemorySearchCache", () => {
  it("expires entries after their TTL", async () => {
    const clock = { ms: 0 };
    const cache = createInMemorySearchCache(() => clock.ms);
    const value = { products: [], cachedAt: "2026-10-11T00:00:00.000Z" };

    await cache.set("k", value, 10);
    clock.ms = 9_999;
    expect(await cache.get("k")).toBe(value);
    clock.ms = 10_000;
    expect(await cache.get("k")).toBeNull();
  });

  it("uses the real clock by default", async () => {
    const cache = createInMemorySearchCache();
    await cache.set("k", { products: [], cachedAt: "x" }, 60);
    expect(await cache.get("k")).not.toBeNull();
    expect(await cache.get("other")).toBeNull();
  });
});

describe("createInMemoryCircuitBreakerStore", () => {
  it("stores state per provider", async () => {
    const store = createInMemoryCircuitBreakerStore();
    await store.set("temu", { status: "open", openedAtMs: 1 });
    expect(await store.get("temu")).toEqual({ status: "open", openedAtMs: 1 });
    expect(await store.get("ebay")).toBeNull();
  });
});
