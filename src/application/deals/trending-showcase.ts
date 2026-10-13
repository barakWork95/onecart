import { assembleResults, type StoreResults } from "@/application/search/assemble-results";
import type { SearchProducts } from "@/application/search/search-products";
import type { TrendingQuery } from "@/domain/deals/trending-query";
import type { IsoDateTime } from "@/domain/product/unified-product";
import type { MatchBasis } from "@/domain/matching/product-matcher";
import type { SearchResultCache } from "@/domain/search/ports";
import { bestOffer } from "@/domain/search/product-group";
import { intentTier } from "@/domain/search/result-ordering";
import { searchIntent } from "@/domain/search/search-intent";
import { rotationFor, rotationTtlSeconds } from "@/domain/deals/warm-rotation";
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

/** A store warmed on a rotation: `perDay` trending queries a day instead of all of them. */
export interface RotatingWarmStore {
  readonly provider: ProviderId;
  readonly perDay: number;
}

export interface WarmPlan {
  /** Stores refreshed for every trending query, every run. */
  readonly daily: readonly ProviderId[];
  /** Scarce-quota stores (SerpApi bills each search): a few queries a day, in turn. */
  readonly rotating: readonly RotatingWarmStore[];
  /** When the run happens (epoch ms); picks today's rotation. */
  readonly atMs: number;
}

export interface WarmedQuery {
  readonly query: string;
  readonly outcomes: readonly { provider: ProviderId; status: string }[];
}

/**
 * Runs the trending searches through the normal search path (circuit breaker,
 * daily call budget) with `refresh`, so each store asked is called even when
 * a cached entry exists, and the showcase and searches read fresh results.
 *
 * - `daily` stores are asked for every query, with the default cache TTL.
 * - Each `rotating` store is asked only for today's slice (`rotationFor`), for
 *   its cheapest page (`lean`), cached until a little after its next turn
 *   (`rotationTtlSeconds`), so a query's results never lapse between turns.
 *
 * Stores not listed are skipped. A query no store is asked about isn't searched.
 */
export async function warmTrendingSearches(
  searchProducts: SearchProducts,
  queries: readonly TrendingQuery[],
  plan: WarmPlan,
): Promise<WarmedQuery[]> {
  const rotatingIds = new Set(plan.rotating.map((r) => r.provider));
  const daily = plan.daily.filter((p) => !rotatingIds.has(p));
  const turns = plan.rotating.map((r) => ({
    provider: r.provider,
    today: new Set(rotationFor(queries, r.perDay, plan.atMs).map((q) => q.query)),
    ttlSeconds: rotationTtlSeconds(queries.length, r.perDay),
  }));

  const results: WarmedQuery[] = [];
  // One query at a time: a cron run has minutes, store APIs prefer no bursts.
  for (const { query } of queries) {
    const rotatingToday = turns.filter((t) => t.today.has(query));
    const stores = [...daily, ...rotatingToday.map((t) => t.provider)];
    if (stores.length === 0) continue;
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
    const response = await searchProducts(searchQuery, {
      refresh: true,
      lean: true,
      cacheTtlSeconds: Object.fromEntries(rotatingToday.map((t) => [t.provider, t.ttlSeconds])),
    });
    results.push({
      query: text,
      outcomes: response.providers
        .filter((o) => o.status !== "skipped")
        .map((o) => ({ provider: o.provider, status: o.status })),
    });
  }
  return results;
}
