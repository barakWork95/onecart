import type { UnifiedProduct } from "@/domain/product/unified-product";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import type { SearchFilters, SearchSort } from "@/domain/search/search-query";
import type { Pagination } from "@/domain/search/search-response";
import { compareMoney } from "@/domain/shared/money";

/** Filters apply per offer, before grouping, so a group never shows an offer the user filtered out. */
export function filterOffers(products: readonly UnifiedProduct[], filters: SearchFilters): UnifiedProduct[] {
  return products.filter((p) => {
    if (filters.minTotal && compareMoney(p.price.total, filters.minTotal) < 0) return false;
    if (filters.maxTotal && compareMoney(p.price.total, filters.maxTotal) > 0) return false;
    if (filters.minRating !== undefined && (p.rating?.average ?? -1) < filters.minRating) return false;
    if (filters.freeShippingOnly && p.delivery.isFreeShipping !== true) return false;
    return true;
  });
}

/** Fastest guaranteed delivery among a group's offers (upper bound of the range); null if unknown. */
function fastestDeliveryDays(group: ProductGroup): number | null {
  let fastest: number | null = null;
  for (const offer of group.offers) {
    const days = offer.delivery.maxDays ?? offer.delivery.minDays;
    if (days !== null && (fastest === null || days < fastest)) fastest = days;
  }
  return fastest;
}

const byPrice = (a: ProductGroup, b: ProductGroup) =>
  compareMoney(bestOffer(a).price.total, bestOffer(b).price.total);
const byId = (a: ProductGroup, b: ProductGroup) => a.id.localeCompare(b.id);

/** Nulls always sort last regardless of direction. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a - b) * direction;
}

/**
 * Position of an offer in its own store's results (0 = the store's top match).
 * Missing offers rank last.
 */
export type RelevanceRank = (offerId: string) => number | undefined;

/** A group is as relevant as its best-ranked offer in any store. */
function groupRank(group: ProductGroup, rankOf: RelevanceRank): number {
  let best = Number.POSITIVE_INFINITY;
  for (const offer of group.offers) best = Math.min(best, rankOf(offer.id) ?? Number.POSITIVE_INFINITY);
  return best;
}

type Comparator = (a: ProductGroup, b: ProductGroup) => number;

const COMPARATORS: Record<Exclude<SearchSort, "relevance">, Comparator> = {
  // More stores on a tie: a wider comparison is more useful to the shopper.
  landed_price_asc: (a, b) => byPrice(a, b) || b.offers.length - a.offers.length || byId(a, b),
  rating_desc: (a, b) =>
    compareNullable(a.rating?.average ?? null, b.rating?.average ?? null, -1) ||
    (b.rating?.count ?? 0) - (a.rating?.count ?? 0) ||
    byPrice(a, b) ||
    byId(a, b),
  delivery_fastest: (a, b) =>
    compareNullable(fastestDeliveryDays(a), fastestDeliveryDays(b), 1) || byPrice(a, b) || byId(a, b),
};

/**
 * Relevance interleaves the stores' own rankings: every store's #1 result
 * comes before any store's #2. Ties go to products found in more stores,
 * then to the lower price. Without ranks, relevance falls back to price.
 */
function relevanceComparator(rankOf: RelevanceRank): Comparator {
  return (a, b) =>
    groupRank(a, rankOf) - groupRank(b, rankOf) ||
    b.offers.length - a.offers.length ||
    byPrice(a, b) ||
    byId(a, b);
}

export function sortGroups(
  groups: readonly ProductGroup[],
  sort: SearchSort,
  rankOf: RelevanceRank = () => undefined,
): ProductGroup[] {
  return [...groups].sort(sort === "relevance" ? relevanceComparator(rankOf) : COMPARATORS[sort]);
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): { readonly items: T[]; readonly pagination: Pagination } {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const safePage = Math.max(1, Math.floor(page));
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    pagination: {
      page: safePage,
      pageSize: safeSize,
      totalResults: items.length,
      hasNextPage: start + safeSize < items.length,
    },
  };
}
