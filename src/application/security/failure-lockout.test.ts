import { createFailureLockout } from "@/application/security/failure-lockout";
import type { CounterStore } from "@/domain/security/ports";

function fakeCounter(): CounterStore {
  const counts = new Map<string, number>();
  return {
    async increment(key) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async count(key) {
      return counts.get(key) ?? 0;
    },
  };
}

describe("createFailureLockout", () => {
  const clock = { ms: Date.UTC(2026, 9, 19, 8, 0, 0) };
  const make = (counter: CounterStore = fakeCounter(), logger = { warn: jest.fn() }) =>
    createFailureLockout({
      prefix: "lock:admin",
      limit: 3,
      windowSeconds: 900,
      counter,
      now: () => clock.ms,
      logger,
    });

  it("locks a subject out after `limit` failures, whatever it tries next, until the window ends", async () => {
    const lockout = make();
    for (let i = 0; i < 3; i++) {
      expect(await lockout.check("203.0.113.7")).toEqual({ locked: false, retryAfterSeconds: 0 });
      await lockout.recordFailure("203.0.113.7");
    }
    const locked = await lockout.check("203.0.113.7");
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(900);
    // Other subjects are unaffected.
    expect((await lockout.check("198.51.100.2")).locked).toBe(false);

    clock.ms += 900_000;
    expect((await lockout.check("203.0.113.7")).locked).toBe(false);
  });

  it("fails open when the counter store is down: it must never lock the owner out by itself", async () => {
    const broken: CounterStore = {
      increment: () => Promise.reject(new Error("down")),
      count: () => Promise.reject(new Error("down")),
    };
    const logger = { warn: jest.fn() };
    const lockout = make(broken, logger);
    await expect(lockout.recordFailure("203.0.113.7")).resolves.toBeUndefined();
    expect(await lockout.check("203.0.113.7")).toEqual({ locked: false, retryAfterSeconds: 0 });
    expect(logger.warn).toHaveBeenCalled();
  });
});
