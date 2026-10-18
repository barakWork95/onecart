import {
  createFeaturedLookup,
  toTrendingCard,
  type TrendingCard,
  type TrendingShowcaseDeps,
} from "@/application/deals/trending-showcase";
import type { Category } from "@/domain/deals/category";
import type { IsoDateTime, LandedPrice } from "@/domain/product/unified-product";
import { bestOffer } from "@/domain/search/product-group";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Below this many priced products a category page is thin: it's kept out of
 * search engines (noindex, not in the sitemap) until the warm-up fills it.
 */
export const MIN_INDEXABLE_PRODUCTS = 3;

/** A category's product: its comparison card plus the best listing in full. */
export interface CategoryProduct extends TrendingCard {
  readonly bestListing: {
    readonly id: string;
    readonly provider: ProviderId;
    readonly title: string;
    /** Clean store URL; the page signs a /go link for it. */
    readonly productUrl: string;
    /** Item, shipping, import VAT, customs and fees, in ILS. */
    readonly price: LandedPrice;
  };
}

export interface CategoryPage {
  readonly category: Category;
  /** In the category's own order; products with nothing suitable cached are left out. */
  readonly products: readonly CategoryProduct[];
  readonly indexable: boolean;
  /** The oldest snapshot on the page, or null when it has no products. */
  readonly pricesAsOf: IsoDateTime | null;
}

/**
 * A category page from cached results only (never a store's API: crawlers
 * are this page's audience). Each product is picked exactly like a homepage
 * card (`createFeaturedLookup`), so the two always agree.
 */
export function createCategoryPage(deps: TrendingShowcaseDeps) {
  const featured = createFeaturedLookup(deps);

  return async function categoryPage(category: Category): Promise<CategoryPage> {
    const found = await Promise.all(
      category.products.map(async ({ label, query }) => {
        const product = await featured(query);
        if (!product) return null;
        const best = bestOffer(product.group);
        return {
          ...toTrendingCard(label, product),
          bestListing: {
            id: best.id,
            provider: best.provider,
            title: best.title,
            productUrl: best.productUrl,
            price: best.price,
          },
        };
      }),
    );
    const products = found.flatMap((p) => (p ? [p] : []));
    return {
      category,
      products,
      indexable: products.length >= MIN_INDEXABLE_PRODUCTS,
      pricesAsOf: products.map((p) => p.pricesAsOf).sort()[0] ?? null,
    };
  };
}
