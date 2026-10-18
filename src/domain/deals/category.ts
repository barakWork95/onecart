import type { TrendingQuery } from "@/domain/deals/trending-query";
import type { MatchMode } from "@/domain/search/search-intent";

/**
 * A product category: a homepage row and an indexable page (`/c/{slug}`),
 * both built from cached results only.
 */
export interface Category {
  /** URL segment and stable id, e.g. "headphones". English, lower-case, hyphenated. */
  readonly slug: string;
  /**
   * `branded`: specific products (brand + model), matched by model number. `generic`:
   * unbranded commodities ("vegetable peeler"), whose look-alikes match by photo.
   */
  readonly mode: MatchMode;
  readonly label: string;
  /** The page's <title> (the layout appends "· OneCart"). */
  readonly seoTitle: string;
  /** Meta description and share text: under 160 characters. */
  readonly description: string;
  /**
   * The page's opening paragraph. Never states tax figures: the "how we price"
   * section reads them from config/israel-import-policy.ts.
   */
  readonly intro: string;
  /** "See all" runs this search (a live, user-initiated search). */
  readonly searchQuery: string;
  /**
   * Branded: specific products (brand + model), so each card is the product itself,
   * not a category's mix. Generic: one commodity item per query. Never a trending
   * query: those have their own grid.
   */
  readonly products: readonly TrendingQuery[];
}

/** Looks a category up by its URL segment. */
export function categoryBySlug(categories: readonly Category[], slug: string): Category | null {
  return categories.find((c) => c.slug === slug) ?? null;
}
