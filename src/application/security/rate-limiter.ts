import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { CounterStore } from "@/domain/security/ports";
import {
  decideRateLimit,
  windowSlot,
  type RateLimitDecision,
  type RateLimitWindow,
} from "@/domain/security/rate-limit";

export interface RateLimiterDeps {
  /** Counter key namespace, e.g. "rl:search". */
  readonly prefix: string;
  readonly windows: readonly RateLimitWindow[];
  readonly counter: CounterStore;
  readonly now?: () => number;
  readonly logger?: Logger;
}

export type RateLimiter = (subject: string) => Promise<RateLimitDecision>;

/**
 * Counts one hit for `subject` in every window and decides. A counter outage
 * allows the hit: a rate limiter must never take the site down with it.
 */
export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;
  return async (subject) => {
    const at = now();
    try {
      const counts = await Promise.all(
        deps.windows.map(async (window) => {
          const slot = windowSlot(deps.prefix, subject, window, at);
          // A little past the window, so a key never expires mid-window on clock skew.
          const count = await deps.counter.increment(slot.key, window.windowSeconds + 60);
          return { window, count, resetsInSeconds: slot.resetsInSeconds };
        }),
      );
      return decideRateLimit(counts);
    } catch (error) {
      logger.warn("rate-limit: counter unavailable, allowing", {
        prefix: deps.prefix,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }
  };
}
