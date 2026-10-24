import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { CounterStore } from "@/domain/security/ports";
import { windowSlot } from "@/domain/security/rate-limit";

export interface FailureLockoutDeps {
  /** Counter key namespace, e.g. "lock:admin". */
  readonly prefix: string;
  /** Failures allowed per window; the next attempt is refused. */
  readonly limit: number;
  readonly windowSeconds: number;
  readonly counter: CounterStore;
  readonly now?: () => number;
  readonly logger?: Logger;
  /** How long a subject's count is trusted from memory before it's read again. */
  readonly memoMs?: number;
}

/** Long enough that an open dashboard's refreshes don't each cost a read. */
const DEFAULT_MEMO_MS = 60_000;

export interface FailureLockout {
  /** Checked before verifying anything, so a locked subject can't even try the right answer. */
  check(subject: string): Promise<{ readonly locked: boolean; readonly retryAfterSeconds: number }>;
  recordFailure(subject: string): Promise<void>;
}

/**
 * Locks a subject (an IP) out for the rest of the window after `limit` failed
 * attempts, against password guessing. Only failures count, so the owner's own
 * requests never lock them out. A counter outage fails open, like the rate limiter.
 *
 * Counts are remembered per instance for `memoMs`. A failure's increment returns the
 * shared count, so the instance that saw it knows at once; another instance can lag
 * by at most `memoMs` (one extra guess there at worst, which records and locks it too).
 */
export function createFailureLockout(deps: FailureLockoutDeps): FailureLockout {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;
  const window = { name: "failures", limit: deps.limit, windowSeconds: deps.windowSeconds };
  const warn = (error: unknown) =>
    logger.warn("lockout: counter unavailable, allowing", {
      prefix: deps.prefix,
      error: error instanceof Error ? error.message : String(error),
    });
  const memoMs = deps.memoMs ?? DEFAULT_MEMO_MS;
  const memo = new Map<string, { failures: number; atMs: number }>();
  const remember = (key: string, failures: number) => {
    if (memo.size > 1_000) memo.clear(); // bounded under a flood of distinct IPs
    memo.set(key, { failures, atMs: now() });
  };
  return {
    async check(subject) {
      const slot = windowSlot(deps.prefix, subject, window, now());
      try {
        const known = memo.get(slot.key);
        let failures: number;
        if (known && now() - known.atMs < memoMs) failures = known.failures;
        else remember(slot.key, (failures = await deps.counter.count(slot.key)));
        return failures >= deps.limit
          ? { locked: true, retryAfterSeconds: slot.resetsInSeconds }
          : { locked: false, retryAfterSeconds: 0 };
      } catch (error) {
        warn(error);
        return { locked: false, retryAfterSeconds: 0 };
      }
    },
    async recordFailure(subject) {
      const slot = windowSlot(deps.prefix, subject, window, now());
      try {
        remember(slot.key, await deps.counter.increment(slot.key, deps.windowSeconds + 60));
      } catch (error) {
        warn(error);
      }
    },
  };
}
