import { cacheLifeFor, LAST_GOOD_LIFE, orUncached, RedisDegradedError } from "@/app/_last-good";

describe("cacheLifeFor", () => {
  it("keeps a good result for an hour, servable for a week while rebuilds keep failing", () => {
    expect(cacheLifeFor("home", { empty: false, degraded: false })).toBe("last-good");
    expect(LAST_GOOD_LIFE).toEqual({ stale: 300, revalidate: 3_600, expire: 7 * 24 * 3_600 });
  });

  it("keeps a legitimately empty result only a few minutes, so it fills soon after the warm-up", () => {
    expect(cacheLifeFor("home", { empty: true, degraded: false })).toBe("minutes");
  });

  it("refuses to cache anything built while Redis is degraded, so Next keeps serving the last good copy", () => {
    expect(() => cacheLifeFor("home", { empty: true, degraded: true })).toThrow(RedisDegradedError);
    // …even a non-empty result: it may be partial (read from one instance's memory).
    expect(() => cacheLifeFor("home", { empty: false, degraded: true })).toThrow(RedisDegradedError);
  });

  it("never fails a build: a degraded prerender is cached only briefly instead", () => {
    expect(
      cacheLifeFor("category:headphones", { empty: false, degraded: true, phase: "phase-production-build" }),
    ).toBe("minutes");
  });
});

describe("orUncached", () => {
  it("returns the cached value when there is one", async () => {
    const uncached = jest.fn(async () => ["fresh"]);
    expect(await orUncached("home", async () => ["cached"], uncached)).toEqual(["cached"]);
    expect(uncached).not.toHaveBeenCalled();
  });

  it("falls back to an uncached build when the cache couldn't be filled (no copy yet, Redis degraded)", async () => {
    const logger = { warn: jest.fn() };
    const value = await orUncached(
      "home",
      () => Promise.reject(new RedisDegradedError("home")),
      async () => [],
      logger,
    );
    expect(value).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("home: no cached copy, built without caching", {
      error: expect.stringContaining("Redis"),
    });
  });
});
