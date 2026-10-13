import { assembleResults, type StoreResults } from "@/application/search/assemble-results";
import type { SearchProducts } from "@/application/search/search-products";
import type { TrendingQuery } from "@/domain/deals/trending-query";
import type { IsoDateTime } from "@/domain/product/unified-product";
import type { MatchBasis } from "@/domain/matching/product-matcher";
import type { SearchResultCache } from "@/domain/search/ports";
import { bestOffer } from "@/domain/search/product-group";
import { intentTier } from "@/domain/search/result-ordering";
import { searchIntent } from "@/domain/search/search-intent";
import { normalizeQueryText, searchCacheKey, type SearchQuery } from "@/domain/search/search-query";
import type { Money } from "@/domain/shared/money";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { ProviderId } from "@/domain/shared/provider";

/** A store the showcase reads cached results for; `cacheScope` as on the provider. */
export interface ShowcaseStore {
  readonly id: ProviderId;
  readonly cacheScope?: string;
}

export interface TrendingCard {
  readonly label: string;
  readonly query: string;
  readonly title: string;
  readonly imageUrl: string | null;
  /** The best landed total and where. */
  readonly best: { readonly provider: ProviderId; readonly total: Money };
  /** Each store with a price, cheapest first, and how many listings it has. */
  readonly stores: readonly {
    readonly provider: ProviderId;
    readonly total: Money;
    readonly listings: number;
  }[];
  /** Stores that list the product but won't ship it to Israel. */
  readonly unshippedStores: readonly ProviderId[];
  readonly matchedBy: "single" | MatchBasis;
  /** When the oldest price on the card was fetched: the card is a snapshot. */
  readonly pricesAsOf: IsoDateTime;
}

export interface TrendingShowcaseDeps {
  readonly cache: SearchResultCache;
  readonly stores: readonly ShowcaseStore[];
  readonly logger?: Logger;
}

const DESTINATION = { country: "IL" } as const;

/**
 * Homepage "Trending" cards, built only from cached search results: the
 * homepage must never call a store's API (crawlers are welcome there; store
 * quotas are not). A product with nothing cached is simply left out. Each
 * card is the search's top result, so it matches the comparison it links to.
 */
export function createTrendingShowcase(deps: TrendingShowcaseDeps) {
  const logger = deps.logger ?? noopLogger;

  async function cardFor({ label, query }: TrendingQuery): Promise<TrendingCard | null> {
    const text = normalizeQueryText(query);
    const entries = await Promise.all(
      deps.stores.map(async (store) => {
        try {
          return await deps.cache.get(
            searchCacheKey({ normalizedText: text, destination: DESTINATION }, store.id, 1, store.cacheScope),
          );
        } catch (error) {
          logger.warn("showcase: cache read failed", {
            provider: store.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );
    const cached = entries.flatMap((e) => (e ? [e] : []));
    if (!cached.some((e) => e.products.length > 0)) return null;

    const intent = searchIntent(text);
    const stores: StoreResults[] = cached.map((e) => ({
      products: e.products,
      unavailable: e.unavailable ?? [],
    }));
    const { groups } = assembleResults(stores, { filters: {}, sort: "relevance" }, intent);
    // The product the search names, never an accessory or a related item.
    const top = groups.find((g) => !g.isAccessory && intentTier(g, intent) === 0);
    if (!top) return null;

    const best = bestOffer(top);
    return {
      label,
      query: text,
      title: top.title,
      imageUrl: top.imageUrl,
      best: { provider: best.provider, total: best.price.total },
      stores: top.offers.map((offer) => ({
        provider: offer.provider,
        total: offer.price.total,
        listings: top.listings.filter((l) => l.provider === offer.provider).length,
      })),
      unshippedStores: top.unavailable.map((u) => u.provider),
      matchedBy: top.matchedBy,
      pricesAsOf: cached.map((e) => e.cachedAt).sort()[0] ?? best.fetchedAt,
    };
  }

  return async function trendingCards(queries: readonly TrendingQuery[]): Promise<TrendingCard[]> {
    const cards = await Promise.all(queries.map(cardFor));
    return cards.flatMap((card) => (card ? [card] : []));
  };
}

export type TrendingShowcase = ReturnType<typeof createTrendingShowcase>;

/**
 * Runs the trending searches through the normal search path (cache, circuit
 * breaker, daily call budget), so the showcase has fresh cached results.
 * Only `stores` are asked; the rest are skipped, so warming can stay off a
 * store with a scarce quota (SerpApi bills every search).
 */
export async function warmTrendingSearches(
  searchProducts: SearchProducts,
  queries: readonly TrendingQuery[],
  stores: readonly ProviderId[],
): Promise<
  { readonly query: string; readonly outcomes: readonly { provider: ProviderId; status: string }[] }[]
> {
  const results = [];
  // One query at a time: a cron run has minutes, store APIs prefer no bursts.
  for (const { query } of queries) {
    const text = normalizeQueryText(query);
    const searchQuery: SearchQuery = {
      rawText: text,
      detectedLanguage: "en",
      normalizedText: text,
      sort: "relevance",
      filters: {},
      destination: DESTINATION,
      providers: stores,
      page: 1,
      pageSize: 20,
    };
    const response = await searchProducts(searchQuery);
    results.push({
      query: text,
      outcomes: response.providers
        .filter((o) => o.status !== "skipped")
        .map((o) => ({ provider: o.provider, status: o.status })),
    });
  }
  return results;
}
