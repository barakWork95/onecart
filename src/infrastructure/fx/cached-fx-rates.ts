import { createFxRates, type FxRates } from "@/domain/pricing/fx-rates";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { FxUnavailableError } from "@/infrastructure/fx/frankfurter-fx-source";

export const FX_KEY = "fx:v1:to-ils";
/** ECB publishes once per business day; refreshing every few hours is plenty. */
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;
/** Last-known-good survives a week-long source outage before prices stop. */
const KEEP_FOR_SECONDS = 7 * 24 * 60 * 60;

interface StoredRates {
  readonly toIls: FxRates["toIls"];
  readonly asOf: string;
  readonly fetchedAtMs: number;
}

function revive(value: unknown): StoredRates | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<StoredRates>;
  if (typeof v.asOf !== "string" || typeof v.fetchedAtMs !== "number" || !v.toIls) return null;
  try {
    createFxRates(v.toIls, v.asOf); // validates every rate
    return { toIls: v.toIls, asOf: v.asOf, fetchedAtMs: v.fetchedAtMs };
  } catch {
    return null;
  }
}

export interface CachedFxDeps {
  readonly source: () => Promise<FxRates>;
  readonly store: RedisLike;
  readonly now?: () => number;
  readonly logger?: Logger;
}

/**
 * `getFxRates()` for the landed-price calculator: in-process memo → Redis
 * (shared, fresh for 6h) → live source. If the source is down, serves the
 * last-known-good rates (up to 7 days old) and logs; throws only when no
 * rates were ever fetched.
 */
export function createCachedFxRates(deps: CachedFxDeps): () => Promise<FxRates> {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;
  let memo: StoredRates | null = null;
  let inFlight: Promise<FxRates> | null = null;

  const isFresh = (s: StoredRates) => now() - s.fetchedAtMs < FRESH_FOR_MS;
  const toRates = (s: StoredRates) => createFxRates(s.toIls, s.asOf);

  async function load(): Promise<FxRates> {
    let stored: StoredRates | null = null;
    try {
      stored = revive(await deps.store.get<unknown>(FX_KEY));
    } catch (error) {
      logger.warn("fx: cache read failed", { error: String(error) });
    }
    if (stored && isFresh(stored)) {
      memo = stored;
      return toRates(stored);
    }

    try {
      const fresh = await deps.source();
      memo = { toIls: fresh.toIls, asOf: fresh.asOf, fetchedAtMs: now() };
      await deps.store.set(FX_KEY, memo, { ex: KEEP_FOR_SECONDS }).catch((error: unknown) => {
        logger.warn("fx: cache write failed", { error: String(error) });
      });
      return fresh;
    } catch (error) {
      const fallback = stored ?? memo;
      if (fallback) {
        logger.warn("fx: source failed, serving last-known-good rates", {
          asOf: fallback.asOf,
          error: String(error),
        });
        return toRates(fallback);
      }
      throw error instanceof FxUnavailableError ? error : new FxUnavailableError(String(error));
    }
  }

  return async function getFxRates() {
    if (memo && isFresh(memo)) return toRates(memo);
    // Collapse concurrent refreshes (every provider asks for rates at once).
    inFlight ??= load().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
