import { diceSimilarity, sharesAny, tokenizeTitle, type TitleTokens } from "@/domain/matching/title-tokens";
import type { UnifiedProduct } from "@/domain/product/unified-product";

export type MatchBasis = "model_number" | "title_similarity";

export interface MatchResult {
  readonly basis: MatchBasis;
  /** Dice similarity of the two titles, 0–1. */
  readonly score: number;
}

export interface MatchingPolicy {
  /** Minimum title similarity when both titles share a model identifier. */
  readonly minScoreWithIdentifier: number;
  /** Minimum title similarity when neither title has an identifier (generic items). */
  readonly minScoreWithoutIdentifier: number;
  /** Max ratio between the two item prices; beyond it they're not the same product. */
  readonly maxPriceRatio: number;
}

/**
 * Tuned to prefer missed matches over wrong ones: a wrong group shows the
 * shopper a "cheaper" offer for a different product, which costs trust.
 */
export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  minScoreWithIdentifier: 0.3,
  minScoreWithoutIdentifier: 0.8,
  maxPriceRatio: 3,
};

/** Product plus its tokens, computed once per search instead of once per comparison. */
export interface MatchCandidate {
  readonly product: UnifiedProduct;
  readonly tokens: TitleTokens;
}

export function toMatchCandidate(product: UnifiedProduct): MatchCandidate {
  return { product, tokens: tokenizeTitle(product.title) };
}

function priceRatio(a: UnifiedProduct, b: UnifiedProduct): number {
  const x = a.price.item.amountMinor;
  const y = b.price.item.amountMinor;
  return Math.max(x, y) / Math.max(1, Math.min(x, y));
}

/**
 * Decides whether two listings from different stores are the same product.
 * Returns null for "not a match". Rules, in order:
 * 1. Same store → never (a group holds one offer per store).
 * 2. One is an accessory and the other isn't ("case for AirPods" ≠ "AirPods").
 * 3. Prices too far apart → different products.
 * 4. Both have identifiers → must share one ("P3" vs "P2" is a conflict), then a low title bar.
 * 5. Otherwise → a high title-similarity bar.
 */
export function matchProducts(
  a: MatchCandidate,
  b: MatchCandidate,
  policy: MatchingPolicy = DEFAULT_MATCHING_POLICY,
): MatchResult | null {
  if (a.product.provider === b.product.provider) return null;
  if (a.tokens.accessoryWords.size > 0 !== b.tokens.accessoryWords.size > 0) return null;
  if (priceRatio(a.product, b.product) > policy.maxPriceRatio) return null;

  const score = diceSimilarity(a.tokens.words, b.tokens.words);
  const bothHaveIdentifiers = a.tokens.identifiers.size > 0 && b.tokens.identifiers.size > 0;

  if (bothHaveIdentifiers) {
    if (!sharesAny(a.tokens.identifiers, b.tokens.identifiers)) return null;
    return score >= policy.minScoreWithIdentifier ? { basis: "model_number", score } : null;
  }
  return score >= policy.minScoreWithoutIdentifier ? { basis: "title_similarity", score } : null;
}
