import { DEFAULT_SEARCH_RATE_LIMITS, searchRateLimits } from "@/config/rate-limits";

describe("searchRateLimits", () => {
  it("defaults to a per-minute and a per-day window, each overridable", () => {
    expect(searchRateLimits().map((w) => [w.name, w.limit])).toEqual([
      ["minute", DEFAULT_SEARCH_RATE_LIMITS.perMinute],
      ["day", DEFAULT_SEARCH_RATE_LIMITS.perDay],
    ]);
    expect(searchRateLimits({ perMinute: 5 }).map((w) => w.limit)).toEqual([
      5,
      DEFAULT_SEARCH_RATE_LIMITS.perDay,
    ]);
  });
});
