import type { RateLimitWindow } from "@/domain/security/rate-limit";

/**
 * Searches one IP may run. A shopper comparing prices runs a few a minute;
 * a crawler runs hundreds. Every search can call the stores' APIs, which
 * have hard daily and monthly limits shared by all shoppers.
 */
export const DEFAULT_SEARCH_RATE_LIMITS = { perMinute: 20, perDay: 300 } as const;

export function searchRateLimits(
  limits: { readonly perMinute?: number; readonly perDay?: number } = {},
): readonly RateLimitWindow[] {
  return [
    { name: "minute", limit: limits.perMinute ?? DEFAULT_SEARCH_RATE_LIMITS.perMinute, windowSeconds: 60 },
    { name: "day", limit: limits.perDay ?? DEFAULT_SEARCH_RATE_LIMITS.perDay, windowSeconds: 24 * 60 * 60 },
  ];
}

/**
 * Live calls per store per day, across all shoppers, kept under each store's
 * hard limit so a flood degrades one store to "Check eBay" links instead of
 * locking it out for everyone until the next day.
 * - eBay Browse API: 5,000 calls a day; leaves room for the price-alert cron.
 * - Amazon (SerpApi): one call is SERPAPI_AMAZON_PAGES searches (default 2),
 *   so 4 calls a day ≈ 240 searches a month, within the free plan's 250.
 *   Raise AMAZON_DAILY_CALL_BUDGET with a bigger plan.
 */
export const DEFAULT_DAILY_CALL_BUDGETS = { ebay: 4_500, amazon: 4 } as const;
