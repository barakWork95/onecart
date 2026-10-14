import { medianAmount } from "@/domain/deals/featured-listing";

/** One product's landed total on one Israeli day (`YYYY-MM-DD`). */
export interface DailyPrice {
  readonly day: string;
  readonly totalMinor: number;
}

export interface PriceDropPolicy {
  /** Earlier days with a price, within the lookback, before anything is claimed. */
  readonly minHistoryDays: number;
  readonly lookbackDays: number;
  /** Share below the typical (median) price, inclusive. */
  readonly minDropShare: number;
  /** And at least this much off, in agorot: 15% of a ₪40 cable is noise, not a deal. */
  readonly minDropMinor: number;
}

export const PRICE_DROP_POLICY: PriceDropPolicy = {
  minHistoryDays: 7,
  lookbackDays: 30,
  minDropShare: 0.15,
  minDropMinor: 20_00,
};

export interface PriceDrop {
  readonly currentMinor: number;
  /** Median of the earlier days in the lookback. */
  readonly typicalMinor: number;
  /** Lowest earlier price in the lookback. */
  readonly lowMinor: number;
  readonly dropMinor: number;
  /** dropMinor ÷ typicalMinor, 0–1. */
  readonly dropShare: number;
  readonly historyDays: number;
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * A real price drop, measured only against prices we recorded ourselves (a
 * store's "was" price proves nothing): today's price is a new low for the
 * lookback and well under the typical price. Null when there isn't enough
 * history or the drop is too small to call.
 */
export function detectPriceDrop(
  history: readonly DailyPrice[],
  today: string,
  policy: PriceDropPolicy = PRICE_DROP_POLICY,
): PriceDrop | null {
  const current = history.find((p) => p.day === today)?.totalMinor;
  if (current === undefined) return null;
  const since = daysBefore(today, policy.lookbackDays);
  const earlier = history.filter((p) => p.day < today && p.day >= since).map((p) => p.totalMinor);
  if (earlier.length < policy.minHistoryDays) return null;

  const typical = medianAmount(earlier) ?? 0;
  const low = Math.min(...earlier);
  const drop = typical - current;
  if (current > low || drop < policy.minDropMinor || drop < typical * policy.minDropShare) return null;
  return {
    currentMinor: current,
    typicalMinor: typical,
    lowMinor: low,
    dropMinor: drop,
    dropShare: Math.round((drop / typical) * 10_000) / 10_000,
    historyDays: earlier.length,
  };
}
