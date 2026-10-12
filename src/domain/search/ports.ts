import type { IsoDateTime, UnifiedProduct } from "@/domain/product/unified-product";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { CircuitState } from "@/domain/search/circuit-breaker";
import type { ProviderId } from "@/domain/shared/provider";

export interface CachedProviderResult {
  readonly products: readonly UnifiedProduct[];
  /** The store had more results past this page when it was cached. */
  readonly hasMore: boolean;
  readonly unavailable?: readonly UnavailableListing[];
  readonly cachedAt: IsoDateTime;
}

/**
 * Cross-request cache of one provider's results for one query. Implementations
 * may throw on infrastructure failure; the search use case treats that as a miss.
 */
export interface SearchResultCache {
  get(key: string): Promise<CachedProviderResult | null>;
  set(key: string, value: CachedProviderResult, ttlSeconds: number): Promise<void>;
}

/** Shared circuit-breaker state. May throw; callers fail open (treat as closed). */
export interface CircuitBreakerStore {
  get(provider: ProviderId): Promise<CircuitState | null>;
  set(provider: ProviderId, state: CircuitState): Promise<void>;
}

export type TranslationSource = "cache" | "deepl" | "glossary";

export interface Translation {
  readonly text: string;
  readonly source: TranslationSource;
  /** Some Hebrew words couldn't be translated and were left out of `text`. */
  readonly partial?: boolean;
}

/**
 * Hebrew → English for store queries. Rejects when no strategy can translate;
 * the caller then searches with the original text and tells the user.
 */
export interface QueryTranslator {
  translateToEnglish(text: string): Promise<Translation>;
}
