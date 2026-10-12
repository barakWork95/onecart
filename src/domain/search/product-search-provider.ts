import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProviderId } from "@/domain/shared/provider";
import type { Result } from "@/domain/shared/result";
import type { SearchQuery } from "@/domain/search/search-query";

export type ProviderErrorKind =
  | "timeout"
  | "rate_limited"
  | "unauthorized"
  | "upstream_error"
  /** Upstream responded but the payload didn't match the expected schema. */
  | "parse_error";

export interface ProviderError {
  readonly provider: ProviderId;
  readonly kind: ProviderErrorKind;
  /** Stable code surfaced in `ProviderOutcome.errorCode`. */
  readonly code: string;
  /** Internal detail for logs only — never sent to the client. */
  readonly detail?: string;
  /** Whether the circuit breaker should count this as a failure (auth/parse errors are bugs, not outages). */
  readonly retryable: boolean;
}

/** One page of a store's own results, in the store's relevance order. */
export interface ProviderPage {
  readonly products: readonly UnifiedProduct[];
  /** The store has results beyond this page (worth fetching on "Load more"). */
  readonly hasMore: boolean;
  /** Items the store lists but won't ship to the destination (only Amazon reports these). */
  readonly unavailable?: readonly UnavailableListing[];
}

export interface ProviderSearchOptions {
  readonly signal: AbortSignal;
  /**
   * 1-based page of the store's own results. What one page holds is up to the
   * adapter (eBay: 50 items; Amazon: page 1 is the first SerpApi pages fetched
   * together, each later page is one more SerpApi page). Defaults to 1.
   */
  readonly storePage?: number;
}

/**
 * Port implemented by every provider adapter in `src/infrastructure/providers/*`.
 * Adapters must never throw for upstream failures — return `err(...)` instead,
 * so the orchestrator can degrade gracefully.
 */
export interface ProductSearchProvider {
  readonly id: ProviderId;
  /**
   * This store's own deadline, for slow upstreams (SerpApi's Amazon engine
   * takes ~3–4s per page). Omit to use the search-wide default.
   */
  readonly timeoutMs?: number;
  search(query: SearchQuery, options: ProviderSearchOptions): Promise<Result<ProviderPage, ProviderError>>;
}
