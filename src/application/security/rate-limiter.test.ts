import { createRateLimiter } from "@/application/security/rate-limiter";
import type { CounterStore } from "@/domain/security/ports";

/** Port fake: counts per key, no expiry needed within one test. */
function fakeCounter(): CounterStore & { readonly ttls: Map<string, number> } {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    ttls,
    async increment(key, ttlSeconds) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      ttls.set(key, ttlSeconds);
      return next;
    },
    async count(key) {
      return counts.get(key) ?? 0;
    },
  };
}

describe("createRateLimiter", () => {
  const clock = { ms: Date.UTC(2026, 9, 13, 6, 0, 0) };
  const windows = [
    { name: "minute", limit: 2, windowSeconds: 60 },
    { name: "day", limit: 3, windowSeconds: 86_400 },
  ];

  it("allows up to the limit per subject, then blocks with a retry time", async () => {
    const limit = createRateLimiter({
      prefix: "rl:search",
      windows,
      counter: fakeCounter(),
      now: () => clock.ms,
    });
    expect((await limit("1.1.1.1")).allowed).toBe(true);
    expect((await limit("1.1.1.1")).allowed).toBe(true);
    expect(await limit("1.1.1.1")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    // Another client has its own counters.
    expect((await limit("2.2.2.2")).allowed).toBe(true);
  });

  it("enforces the longer window across minutes", async () => {
    const limit = createRateLimiter({
      prefix: "rl:search",
      windows,
      counter: fakeCounter(),
      now: () => clock.ms,
    });
    await limit("ip");
    await limit("ip");
    clock.ms += 61_000;
    expect((await limit("ip")).allowed).toBe(true);
    const blocked = await limit("ip");
    expect(blocked.allowed).toBe(false);
    // Day windows end at 00:00 UTC: hours away, not the minute window's seconds.
    expect(blocked.retryAfterSeconds).toBeGreaterThan(3_600);
  });

  it("keeps counters a minute past their window", async () => {
    const counter = fakeCounter();
    await createRateLimiter({ prefix: "p", windows, counter, now: () => clock.ms })("ip");
    expect([...counter.ttls.values()].sort((a, b) => a - b)).toEqual([120, 86_460]);
  });

  it("fails open when the counter is down: never takes the site down with it", async () => {
    const logger = { warn: jest.fn() };
    const limit = createRateLimiter({
      prefix: "rl:search",
      windows,
      counter: { increment: () => Promise.reject(new Error("redis down")), count: async () => 0 },
      logger,
    });
    expect(await limit("ip")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(logger.warn).toHaveBeenCalledWith("rate-limit: counter unavailable, allowing", {
      prefix: "rl:search",
      error: "redis down",
    });
  });
});
