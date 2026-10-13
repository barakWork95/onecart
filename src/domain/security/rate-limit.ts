/** One fixed window: at most `limit` hits per `windowSeconds`. */
export interface RateLimitWindow {
  /** Part of the counter key, e.g. "minute". */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the tightest exhausted window resets; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

/**
 * The counter key for `subject` in the window containing `nowMs`, and the
 * seconds left in it. Fixed windows aligned to the epoch: cheap (one INCR per
 * window) and good enough to stop floods.
 */
export function windowSlot(
  prefix: string,
  subject: string,
  window: RateLimitWindow,
  nowMs: number,
): { readonly key: string; readonly resetsInSeconds: number } {
  const size = window.windowSeconds * 1000;
  const index = Math.floor(nowMs / size);
  return {
    key: `${prefix}:${window.name}:${subject}:${index}`,
    resetsInSeconds: Math.max(1, Math.ceil(((index + 1) * size - nowMs) / 1000)),
  };
}

/** Allowed only when every window is within its limit. */
export function decideRateLimit(
  counts: readonly {
    readonly window: RateLimitWindow;
    readonly count: number;
    readonly resetsInSeconds: number;
  }[],
): RateLimitDecision {
  const exceeded = counts.filter(({ window, count }) => count > window.limit);
  if (exceeded.length === 0) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(...exceeded.map((c) => c.resetsInSeconds)) };
}
