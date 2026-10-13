import { decideRateLimit, windowSlot, type RateLimitWindow } from "@/domain/security/rate-limit";

const minute: RateLimitWindow = { name: "minute", limit: 2, windowSeconds: 60 };
const day: RateLimitWindow = { name: "day", limit: 5, windowSeconds: 86_400 };

describe("windowSlot", () => {
  it("keys each fixed window and counts the seconds left in it", () => {
    const at = Date.UTC(2026, 9, 13, 6, 30, 15);
    expect(windowSlot("rl", "1.2.3.4", minute, at)).toEqual({
      key: `rl:minute:1.2.3.4:${Math.floor(at / 60_000)}`,
      resetsInSeconds: 45,
    });
    // The next minute is a new window.
    expect(windowSlot("rl", "1.2.3.4", minute, at + 45_000).key).not.toBe(
      windowSlot("rl", "1.2.3.4", minute, at).key,
    );
  });

  it("never reports fewer than 1 second left", () => {
    expect(windowSlot("rl", "x", minute, 60_000 * 10 - 1).resetsInSeconds).toBe(1);
  });
});

describe("decideRateLimit", () => {
  it("allows while every window is within its limit, the limit itself included", () => {
    expect(
      decideRateLimit([
        { window: minute, count: 2, resetsInSeconds: 10 },
        { window: day, count: 5, resetsInSeconds: 999 },
      ]),
    ).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("blocks past any limit, until the longest exhausted window resets", () => {
    expect(decideRateLimit([{ window: minute, count: 3, resetsInSeconds: 10 }])).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(
      decideRateLimit([
        { window: minute, count: 3, resetsInSeconds: 10 },
        { window: day, count: 6, resetsInSeconds: 999 },
      ]),
    ).toEqual({ allowed: false, retryAfterSeconds: 999 });
  });
});
