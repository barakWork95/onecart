import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import { groupProducts, type ProductGroup } from "@/domain/search/product-group";
import { filterOffers, sortGroups } from "@/domain/search/result-ordering";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { classifyOffers, isOffTopic, type SearchIntent } from "@/domain/search/search-intent";
import type { SearchQuery } from "@/domain/search/search-query";

/** One store's results so far, store pages in order. */
export interface StoreResults {
  readonly products: readonly UnifiedProduct[];
  readonly unavailable: readonly UnavailableListing[];
}

export interface AssembledResults {
  /** Offers after the shopper's filters, across every store. */
  readonly offers: readonly UnifiedProduct[];
  /** Grouped, classified and sorted, as the results page shows them. */
  readonly groups: readonly ProductGroup[];
}

/**
 * Stores' results → the cards a shopper sees: drop off-topic listings from
 * loose-search stores (`isOffTopic`), rank within each store, filter, classify
 * against the query's intent, group across and within stores, sort.
 * Pure, so the search page and the homepage showcase can't drift apart.
 */
export function assembleResults(
  stores: readonly StoreResults[],
  query: Pick<SearchQuery, "filters" | "sort">,
  intent: SearchIntent,
): AssembledResults {
  const ranks = new Map<string, number>();
  const products: UnifiedProduct[] = [];
  const unavailable = new Map<string, UnavailableListing>();
  for (const store of stores) {
    let rank = 0;
    for (const product of store.products) {
      // Stores repeat items across pages (sponsored slots); the first position counts.
      if (ranks.has(product.id) || isOffTopic(product, intent, tokenizeTitle(product.title))) continue;
      ranks.set(product.id, rank++);
      products.push(product);
    }
    for (const listing of store.unavailable) unavailable.set(listing.id, listing);
  }
  const offers = filterOffers(products, query.filters);
  // Classified on every loaded offer, before filters, so a price filter can't move the typical price.
  const classes = classifyOffers(products, intent);
  const rankOf = (id: string) => ranks.get(id);
  const groups = sortGroups(
    groupProducts(offers, { classes, unavailable: [...unavailable.values()], rankOf }),
    query.sort,
    rankOf,
    intent,
  );
  return { offers, groups };
}
