import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Stores whose main product image follows a catalog standard. Amazon requires
 * the main image to show only the product on a pure white background, so it
 * beats a marketplace seller's own photo (a lifestyle shot, a box on a table).
 */
export const CATALOG_IMAGE_STORES: readonly ProviderId[] = ["amazon"];

/** Position in the listing's own store results; unranked listings come last. */
export type ListingRank = (id: string) => number | undefined;

const rankOrLast = (rankOf: ListingRank | undefined, id: string) => rankOf?.(id) ?? Number.POSITIVE_INFINITY;

/** The store's best match first, then most reviewed, then cheapest (listings arrive cheapest first). */
function byStandingIn(
  listings: readonly UnifiedProduct[],
  rankOf: ListingRank | undefined,
): UnifiedProduct[] {
  return listings
    .map((listing, cheapness) => ({ listing, cheapness }))
    .sort(
      (a, b) =>
        rankOrLast(rankOf, a.listing.id) - rankOrLast(rankOf, b.listing.id) ||
        (b.listing.rating?.count ?? 0) - (a.listing.rating?.count ?? 0) ||
        a.cheapness - b.cheapness,
    )
    .map(({ listing }) => listing);
}

/**
 * The card's photo: a catalog store's image when the group has one (its
 * listings first, then a "won't ship to Israel" listing of the same product),
 * else the photo of the listing the stores themselves rank best. Never just
 * the cheapest listing's: the cheapest seller's photo is often the worst.
 */
export function heroImage(
  listings: readonly UnifiedProduct[],
  unavailable: readonly UnavailableListing[],
  rankOf?: ListingRank,
): string | null {
  const ranked = byStandingIn(listings, rankOf);
  const fromCatalog =
    ranked.find((l) => l.imageUrl && CATALOG_IMAGE_STORES.includes(l.provider))?.imageUrl ??
    unavailable.find((u) => u.imageUrl && CATALOG_IMAGE_STORES.includes(u.provider))?.imageUrl;
  return fromCatalog ?? ranked.find((l) => l.imageUrl)?.imageUrl ?? null;
}

/**
 * Where the card's title comes from: the most-reviewed listing (usually the
 * canonical product page), else the stores' best match, whose wording beats a
 * bargain seller's "New! … BlackAuto NC".
 */
export function heroTitleListing(
  listings: readonly [UnifiedProduct, ...UnifiedProduct[]],
  rankOf?: ListingRank,
): UnifiedProduct {
  const [first] = listings;
  const mostReviewed = [...listings].sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0))[0];
  if (mostReviewed && (mostReviewed.rating?.count ?? 0) > 0) return mostReviewed;
  return byStandingIn(listings, rankOf)[0] ?? first;
}
