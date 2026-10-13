import type { TrendingQuery } from "@/domain/deals/trending-query";

/**
 * Products on the homepage "Trending" grid, by the search that finds them.
 * Cards come from cached results only; the daily warm-trending cron keeps
 * those searches cached (see TRENDING_WARM_STORES).
 */
export const TRENDING_QUERIES: readonly TrendingQuery[] = [
  { label: "Sony WH-1000XM5", query: "sony wh-1000xm5" },
  { label: "Instant Pot Duo", query: "instant pot duo" },
  { label: "AirPods Pro", query: "airpods pro" },
  { label: "Kindle Paperwhite", query: "kindle paperwhite" },
  { label: "JBL Flip 6", query: "jbl flip 6" },
];

/** The demo catalog's equivalents (local demo runs and E2E). */
export const DEMO_TRENDING_QUERIES: readonly TrendingQuery[] = [
  { label: "Soundcore Life P3", query: "soundcore life p3" },
  { label: "Sony WH-CH720N", query: "sony wh-ch720n" },
  { label: "Keychron K2", query: "keychron k2" },
  { label: "Memory foam pillow", query: "memory foam pillow" },
  { label: "Baseus Bowie M2+", query: "baseus bowie m2" },
];

/**
 * Stores the warm-trending cron refreshes for every query, every day. eBay by
 * default: 5 calls a day against its 5,000. Amazon isn't listed: SerpApi's
 * quota is too small for daily refreshes, so it's warmed on a rotation
 * (AMAZON_WARM_PER_DAY, see config/rate-limits.ts) that overrides this list.
 */
export const DEFAULT_TRENDING_WARM_STORES = ["ebay"] as const;
