import type { IsoDateTime } from "@/domain/product/unified-product";
import type { ProductGroup } from "@/domain/search/product-group";
import type { ProviderId } from "@/domain/shared/provider";
import type { SearchQuery } from "@/domain/search/search-query";

/**
 * Why a provider did or didn't contribute results. The UI uses this to show
 * "eBay is temporarily unavailable" instead of failing the whole search.
 */
export type ProviderStatus =
  | "ok"
  | "empty"
  | "timeout"
  | "error"
  /** Circuit breaker is open; the provider was not called at all. */
  | "circuit_open"
  /** Excluded by the query's `providers` filter or disabled by config. */
  | "skipped";

export interface ProviderOutcome {
  readonly provider: ProviderId;
  readonly status: ProviderStatus;
  readonly resultCount: number;
  /** null when the provider was not called (skipped / circuit_open / cache hit). Includes time spent waiting on a timeout. */
  readonly latencyMs: number | null;
  readonly fromCache: boolean;
  /** When any page shown came from the cache: when the oldest such page was fetched from the store. */
  readonly cachedAt?: IsoDateTime;
  /** Stable machine-readable code (e.g. "HTTP_429", "PARSE_ERROR"); never a raw upstream message. */
  readonly errorCode?: string;
}

/** Statuses that mean "this store should have answered but didn't" — they make a response partial. */
export const FAILED_PROVIDER_STATUSES: readonly ProviderStatus[] = ["timeout", "error", "circuit_open"];

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  /** Number of product groups (cards) after filtering, across all pages. */
  readonly totalResults: number;
  readonly hasNextPage: boolean;
}

export interface SearchResponse {
  readonly query: SearchQuery;
  /** Products grouped across stores, filtered and sorted per `query`; this page only. */
  readonly groups: readonly ProductGroup[];
  /** Individual store offers after filtering, across all pages. */
  readonly totalOffers: number;
  readonly providers: readonly ProviderOutcome[];
  readonly pagination: Pagination;
  /**
   * true when at least one requested provider timed out, errored, or was
   * circuit-open — the UI shows "Some stores are unavailable". When every
   * requested provider failed, `groups` is empty and the UI shows an error state.
   */
  readonly isPartial: boolean;
  readonly generatedAt: IsoDateTime;
}
