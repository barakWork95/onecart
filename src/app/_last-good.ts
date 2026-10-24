import { noopLogger, type Logger } from "@/domain/shared/logger";

/**
 * Stale-while-error for views cached from Redis (homepage sections, category
 * pages). Next keeps serving an entry past `revalidate` while it rebuilds in the
 * background, and a rebuild that throws is never stored: the previous copy
 * stays. So a rebuild during a Redis outage throws instead of caching the
 * empty or partial view it would otherwise produce.
 */

/** A good copy: refreshed hourly, and servable for a week while refreshes keep failing. */
export const LAST_GOOD_LIFE = { stale: 300, revalidate: 3_600, expire: 7 * 24 * 3_600 } as const;

export class RedisDegradedError extends Error {
  constructor(what: string) {
    super(`${what}: Redis is degraded, keeping the last good copy`);
    this.name = "RedisDegradedError";
  }
}

/**
 * The cache lifetime for a freshly built view: `last-good` for a result worth
 * keeping, `minutes` for a legitimately empty one (it fills soon after the
 * warm-up). Throws while Redis is degraded, except during `next build`, where a
 * throw would fail the deploy: that prerender is cached briefly instead.
 */
export function cacheLifeFor(
  what: string,
  state: { readonly empty: boolean; readonly degraded: boolean; readonly phase?: string | undefined },
): "last-good" | "minutes" {
  const phase = "phase" in state ? state.phase : process.env.NEXT_PHASE;
  if (state.degraded) {
    if (phase === "phase-production-build") return "minutes";
    throw new RedisDegradedError(what);
  }
  return state.empty ? "minutes" : "last-good";
}

/**
 * The cached view, or, when its cache couldn't be filled (no copy yet and
 * Redis degraded), the same view built without caching: never a failed page.
 */
export async function orUncached<T>(
  what: string,
  cached: () => Promise<T>,
  uncached: () => Promise<T>,
  logger: Logger = noopLogger,
): Promise<T> {
  try {
    return await cached();
  } catch (error) {
    logger.warn(`${what}: no cached copy, built without caching`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return uncached();
  }
}
