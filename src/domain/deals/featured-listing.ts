import type { TitleTokens } from "@/domain/matching/title-tokens";
import { isUnverifiedBrandListing } from "@/domain/matching/product-matcher";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { SearchIntent } from "@/domain/search/search-intent";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Stores whose titles come from a product catalog and often drop the brand
 * ("WH-1000XM5 Premium Noise Cancelling…", "Duo 6 Qt 7-in-1…" on Amazon).
 */
export const CATALOG_TITLE_STORES: ReadonlySet<ProviderId> = new Set(["amazon"]);

/**
 * A featured card's price must sit within this share of the typical price of
 * the listings naming the product: the store's top result can be a ₪3,304
 * air fryer (shipping to Israel) or a suspiciously cheap "new" machine.
 */
export const FEATURED_PRICE_BAND = { min: 0.5, max: 2 } as const;

/**
 * Whether a listing may be featured on the homepage, where a card reads as an
 * endorsement. Stricter than search results:
 * - a branded query's listing names that brand, so a clone ("BOROFONE … AirTag
 *   … Compatible") can't stand in for it; catalog stores are exempt;
 * - no branded marketplace listing from a non-official store (knock-offs).
 */
export function isFeaturableListing(
  product: UnifiedProduct,
  tokens: TitleTokens,
  intent: SearchIntent,
): boolean {
  if (isUnverifiedBrandListing({ product, tokens })) return false;
  const brands = intent.tokens.brands;
  if (brands.size === 0 || CATALOG_TITLE_STORES.has(product.provider)) return true;
  return [...brands].some((brand) => tokens.brands.has(brand));
}

/** Median of the given amounts (minor units), or null for none. */
export function medianAmount(amounts: readonly number[]): number | null {
  if (amounts.length === 0) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Within `FEATURED_PRICE_BAND` of the typical amount. */
export function isTypicalPrice(amount: number, typical: number): boolean {
  return amount >= typical * FEATURED_PRICE_BAND.min && amount <= typical * FEATURED_PRICE_BAND.max;
}
