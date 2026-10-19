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
 * Live calls per store per day for shoppers' searches, across all shoppers,
 * kept under each store's hard limit so a flood degrades one store to "Check
 * eBay" links instead of locking it out for everyone until the next day.
 * - eBay Browse API: 5,000 calls a day; leaves room for the crons.
 * - Amazon (SerpApi, 250 searches a month on the free plan): a shopper's call
 *   is SERPAPI_AMAZON_PAGES searches (default 2), so 3 calls = 6 searches a
 *   day. Cache warming has its own budget below: 6 + 2 = 8 a day ≈ 248 a month.
 *   Raise both with a bigger plan.
 * - AliExpress Affiliate API (product.query): the app's quota is shown in the
 *   Open Platform console; 2,000 a day is a conservative cap. Affiliate-link
 *   calls at /go time are separate and cached for 30 days.
 */
export const DEFAULT_DAILY_CALL_BUDGETS = { ebay: 4_500, amazon: 3, aliexpress: 2_000 } as const;

/**
 * Trending queries warmed on Amazon per day (AMAZON_WARM_PER_DAY), one
 * SerpApi search each, counted apart from shoppers' budget so warming can
 * never spend their searches. 0 turns Amazon warming off.
 */
export const DEFAULT_AMAZON_WARM_PER_DAY = 2;

/**
 * /go clicks one IP may make. Each one writes a click row and can call
 * AliExpress's link API; a shopper opens a handful of stores per search.
 */
export const GO_RATE_LIMITS: readonly RateLimitWindow[] = [
  { name: "minute", limit: 60, windowSeconds: 60 },
  { name: "day", limit: 1_000, windowSeconds: 24 * 60 * 60 },
];

/**
 * Server Action POSTs (Save, Alerts, push subscribe) one IP may send. They
 * write to Supabase and read the search cache; a shopper sends a few per visit.
 */
export const ACTION_RATE_LIMITS: readonly RateLimitWindow[] = [
  { name: "minute", limit: 30, windowSeconds: 60 },
  { name: "day", limit: 500, windowSeconds: 24 * 60 * 60 },
];

/** Wrong /internal passwords per IP before it's locked out for the rest of the window. */
export const ADMIN_LOCKOUT = { limit: 10, windowSeconds: 15 * 60 } as const;
