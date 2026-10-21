import { assembleResults, type StoreResults } from "@/application/search/assemble-results";
import { photoHashesFor, type PhotoHashReader } from "@/application/search/photo-hashes";
import type { SearchProducts } from "@/application/search/search-products";
import type { TrendingQuery } from "@/domain/deals/trending-query";
import type { IsoDateTime } from "@/domain/product/unified-product";
import type { MatchBasis } from "@/domain/matching/product-matcher";
import type { SearchResultCache } from "@/domain/search/ports";
import type { SearchResponse } from "@/domain/search/search-response";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { intentTier } from "@/domain/search/result-ordering";
import { searchIntent } from "@/domain/search/search-intent";
import { rotationFor, rotationTtlSeconds } from "@/domain/deals/warm-rotation";
import { isFeaturableListing, isTypicalPrice, medianAmount } from "@/domain/deals/featured-listing";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { unitPrice, type UnitPrice } from "@/domain/matching/unit-price";
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
    /** False when the store didn't quote shipping: the total is the item alone. */
    readonly shippingKnown: boolean;
    readonly listings: number;
  }[];
  /** Stores that list the product but won't ship it to Israel. */
  readonly unshippedStores: readonly ProviderId[];
  readonly matchedBy: "single" | MatchBasis;
  /** Unbranded look-alikes grouped by photo: "Looks identical · Best value". */
  readonly lookAlike: boolean;
  /** The best offer's price per piece when it's a stated multi-pack. */
  readonly unitPrice: UnitPrice | null;
  /** When the oldest price on the card was fetched: the card is a snapshot. */
  readonly pricesAsOf: IsoDateTime;
}

export interface TrendingShowcaseDeps {
  readonly cache: SearchResultCache;
  readonly stores: readonly ShowcaseStore[];
  /** Cached photo hashes, so a generic query's card groups look-alikes as its search does. */
  readonly imageHashes?: PhotoHashReader;
  readonly logger?: Logger;
}

const DESTINATION = { country: "IL" } as const;

/** The product a query names, as cached: what a card or a category page features. */
export interface Featured {
  /** The query, normalized. */
  readonly query: string;
  readonly group: ProductGroup;
  /** When the oldest price behind it was fetched: it's a snapshot. */
  readonly pricesAsOf: IsoDateTime;
}

/**
 * Reads a query's cached results (never a store's API: crawlers are welcome
 * on pages built from this; store quotas are not) and picks the product the
 * query names that a page may feature: the search's top result among
 * featurable listings, never an accessory or a related item, at a typical
 * price. Null when nothing suitable is cached.
 */
export function createFeaturedLookup(deps: TrendingShowcaseDeps) {
  const logger = deps.logger ?? noopLogger;

  return async function featured(query: string): Promise<Featured | null> {
    const text = normalizeQueryText(query);
    const keys = deps.stores.map((store) =>
      searchCacheKey({ normalizedText: text, destination: DESTINATION }, store.id, 1, store.cacheScope),
    );
    // One batched read for every store (a homepage render reads ~100 products).
    const entries = await deps.cache.getMany(keys).catch(() =>
      // …and store by store if that fails, so one bad store doesn't hide the others.
      Promise.all(
        deps.stores.map(async (store, i) => {
          try {
            return await deps.cache.get(keys[i]!);
          } catch (error) {
            logger.warn("showcase: cache read failed", {
              provider: store.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        }),
      ),
    );
    const cached = entries.flatMap((e) => (e ? [e] : []));
    if (!cached.some((e) => e.products.length > 0)) return null;

    const intent = searchIntent(text);
    // A card is an endorsement: only listings it may feature (see `isFeaturableListing`), and
    // only landed prices. A store that didn't quote shipping (AliExpress never does) has an
    // item price, not a total: it stays in live search as "+ shipping", never on a card.
    const stores: StoreResults[] = cached.map((e) => ({
      products: e.products.filter(
        (p) => p.price.shippingKnown && isFeaturableListing(p, tokenizeTitle(p.title), intent),
      ),
      unavailable: e.unavailable ?? [],
    }));
    const products = stores.flatMap((s) => s.products);
    const hashes = await photoHashesFor(deps.imageHashes, products, intent, logger);
    const { groups } = assembleResults(stores, { filters: {}, sort: "relevance" }, intent, hashes);
    // The product the search names, never an accessory or a related item…
    const named = groups.filter((g) => !g.isAccessory && intentTier(g, intent) === 0);
    // …at a typical price for it: the stores' top result can be an outlier.
    const typical = medianAmount(named.map((g) => bestOffer(g).price.total.amountMinor));
    const group = named.find(
      (g) => typical !== null && isTypicalPrice(bestOffer(g).price.total.amountMinor, typical),
    );
    if (!group) return null;
    return {
      query: text,
      group,
      pricesAsOf: cached.map((e) => e.cachedAt).sort()[0] ?? bestOffer(group).fetchedAt,
    };
  };
}

/** A featured product as a compact comparison card. */
export function toTrendingCard(label: string, { query, group, pricesAsOf }: Featured): TrendingCard {
  const best = bestOffer(group);
  return {
    label,
    query,
    title: group.title,
    imageUrl: group.imageUrl,
    best: { provider: best.provider, total: best.price.total },
    stores: group.offers.map((offer) => ({
      provider: offer.provider,
      total: offer.price.total,
      shippingKnown: offer.price.shippingKnown,
      listings: group.listings.filter((l) => l.provider === offer.provider).length,
    })),
    unshippedStores: group.unavailable.map((u) => u.provider),
    matchedBy: group.matchedBy,
    lookAlike: group.lookAlike,
    unitPrice: unitPrice(best.title, best.price.total),
    pricesAsOf,
  };
}

/**
 * Homepage "Trending" cards, from cached search results only. A product with
 * nothing suitable cached is left out. Each card is the search's top result,
 * so it matches the comparison it links to.
 */
export function createTrendingShowcase(deps: TrendingShowcaseDeps) {
  const featured = createFeaturedLookup(deps);
  return async function trendingCards(queries: readonly TrendingQuery[]): Promise<TrendingCard[]> {
    const cards = await Promise.all(
      queries.map(async ({ label, query }) => {
        const found = await featured(query);
        return found ? toTrendingCard(label, found) : null;
      }),
    );
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

/** Groups a warm-up search returns: all of them (store pages hold ~70 listings). */
export const WARM_PAGE_SIZE = 200;

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
 * Queries run `concurrency` at a time (default 1: store APIs prefer no bursts),
 * and results come back in query order.
 */
export async function warmTrendingSearches(
  searchProducts: SearchProducts,
  queries: readonly TrendingQuery[],
  plan: WarmPlan,
  options: {
    readonly concurrency?: number;
    /** Sees every warmed search's response (price history records from it). */
    readonly onWarmed?: (query: string, response: SearchResponse) => void;
  } = {},
): Promise<WarmedQuery[]> {
  const rotatingIds = new Set(plan.rotating.map((r) => r.provider));
  const daily = plan.daily.filter((p) => !rotatingIds.has(p));
  const turns = plan.rotating.map((r) => ({
    provider: r.provider,
    today: new Set(rotationFor(queries, r.perDay, plan.atMs).map((q) => q.query)),
    ttlSeconds: rotationTtlSeconds(queries.length, r.perDay),
  }));

  async function warm(query: string): Promise<WarmedQuery | null> {
    const rotatingToday = turns.filter((t) => t.today.has(query));
    const stores = [...daily, ...rotatingToday.map((t) => t.provider)];
    if (stores.length === 0) return null;
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
      // Every group the store pages hold, not one results page: photo hashing and price
      // history read the response, and a bigger page costs no store calls.
      pageSize: WARM_PAGE_SIZE,
    };
    const response = await searchProducts(searchQuery, {
      refresh: true,
      lean: true,
      cacheTtlSeconds: Object.fromEntries(rotatingToday.map((t) => [t.provider, t.ttlSeconds])),
    });
    options.onWarmed?.(text, response);
    return {
      query: text,
      outcomes: response.providers
        .filter((o) => o.status !== "skipped")
        .map((o) => ({ provider: o.provider, status: o.status })),
    };
  }

  const results: (WarmedQuery | null)[] = new Array(queries.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < queries.length) {
      const index = next++;
      const item = queries[index];
      if (item) results[index] = await warm(item.query);
    }
  };
  const workers = Math.max(1, Math.min(queries.length, Math.floor(options.concurrency ?? 1)));
  await Promise.all(Array.from({ length: workers }, worker));
  return results.flatMap((r) => (r ? [r] : []));
}
