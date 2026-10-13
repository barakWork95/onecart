import type { Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/** Longest query we accept from the user. */
export const MAX_QUERY_LENGTH = 200;

/**
 * `relevance` (the default) keeps each store's own best-match order, merged
 * across stores; the others re-sort by our computed values.
 */
export const SEARCH_SORTS = ["relevance", "landed_price_asc", "delivery_fastest", "rating_desc"] as const;
export const DEFAULT_SORT: SearchSort = "relevance";
export type SearchSort = (typeof SEARCH_SORTS)[number];

export type QueryLanguage = "he" | "en";

export interface SearchFilters {
  readonly minTotal?: Money;
  readonly maxTotal?: Money;
  /** 0–5. */
  readonly minRating?: number;
  readonly freeShippingOnly?: boolean;
}

export interface DeliveryDestination {
  readonly country: "IL";
  /** Used for courier estimates only; never required. */
  readonly city?: string;
}

export interface SearchQuery {
  /** Exactly what the user typed (may be Hebrew). Shown back in the UI. */
  readonly rawText: string;
  readonly detectedLanguage: QueryLanguage;
  /**
   * English, lower-cased, whitespace-collapsed text sent to providers.
   * Equal to the normalized `rawText` when the user typed English.
   */
  readonly normalizedText: string;
  readonly sort: SearchSort;
  /** Subset to query; empty/undefined means all enabled providers. */
  readonly providers?: readonly ProviderId[];
  readonly filters: SearchFilters;
  readonly destination: DeliveryDestination;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

/** Lower-case, trim, collapse whitespace — so "Wireless  Earbuds " and "wireless earbuds" share a cache entry. */
export function normalizeQueryText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Redis key for one page of a provider's results for a query. Only fields that
 * change what providers return belong here — sort/filters/page size are applied
 * after the cache read, so they must NOT fragment the cache. Store page 1 has
 * no suffix. Bump the version when the cached entry shape, `UnifiedProduct` or
 * the import-tax policy changes (v3: entries carry `hasMore` and `unavailable`).
 */
export function searchCacheKey(
  query: Pick<SearchQuery, "normalizedText" | "destination">,
  provider: ProviderId,
  storePage = 1,
  /** Keeps a provider's non-live data (recorded samples) apart from its live results. */
  scope?: string,
): string {
  const source = scope ? `${provider}@${scope}` : provider;
  const base = `search:v3:${query.destination.country}:${source}:${normalizeQueryText(query.normalizedText)}`;
  return storePage > 1 ? `${base}:p${storePage}` : base;
}
