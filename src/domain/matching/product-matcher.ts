import {
  containment,
  diceSimilarity,
  sharesAny,
  sharesModel,
  tokenizeTitle,
  type TitleTokens,
} from "@/domain/matching/title-tokens";
import type { UnifiedProduct } from "@/domain/product/unified-product";

export type MatchBasis = "model_number" | "title_similarity";

export interface MatchResult {
  readonly basis: MatchBasis;
  /** Dice similarity of the two titles, 0–1. */
  readonly score: number;
}

export interface MatchingPolicy {
  /** With a shared model code: minimum share of the shorter title found in the longer one. */
  readonly minContainmentWithModel: number;
  /** With a shared model code: minimum Dice similarity, so a stray code can't carry unrelated titles. */
  readonly minScoreWithModel: number;
  /**
   * With a shared series number or generation and a known brand ("JBL Flip 6",
   * "AirPods Pro 2nd Gen"): minimum containment. Higher than with a model code,
   * because "Charge 6" and "Flip 6" share their number too.
   */
  readonly minContainmentWithSeries: number;
  /** Without a shared model code (generic items, accessories): minimum Dice similarity. */
  readonly minScoreWithoutModel: number;
  /** Max ratio between the two item prices; beyond it they're not the same product. */
  readonly maxPriceRatio: number;
  /**
   * Max price ratio between two listings of one product at the same store.
   * Wider: sellers list colours, bundled cases and imports of one model
   * (eBay's WH-1000XM5 ran ₪660–₪1,750).
   */
  readonly maxSameStorePriceRatio: number;
  /** Two same-store listings without a shared model code collapse only on near-identical branded titles. */
  readonly minSameStoreTitleScore: number;
  /** Same store, same long model code (6+ characters): minimum containment. */
  readonly minSameStoreContainment: number;
  /** Same store, same brand and series number, no model codes: minimum containment. */
  readonly minSameStoreSeriesContainment: number;
}

/**
 * Tuned on recorded Amazon and eBay results to prefer missed matches over
 * wrong ones: a wrong group shows the shopper a "cheaper" offer for a
 * different product, which costs trust.
 */
export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  minContainmentWithModel: 0.5,
  minScoreWithModel: 0.25,
  minContainmentWithSeries: 0.8,
  minScoreWithoutModel: 0.8,
  maxPriceRatio: 2.5,
  maxSameStorePriceRatio: 3,
  minSameStoreTitleScore: 0.9,
  minSameStoreContainment: 0.25,
  minSameStoreSeriesContainment: 0.6,
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

/** Both sides state the attribute and no value agrees. One side silent is not a conflict. */
/** A shared series number or generation, named under a known brand on at least one side. */
function sharesSeries(a: TitleTokens, b: TitleTokens): boolean {
  if (a.brands.size === 0 && b.brands.size === 0) return false;
  const aGen = a.variants.get("gen");
  const bGen = b.variants.get("gen");
  return sharesAny(a.numbers, b.numbers) || (!!aGen && !!bGen && sharesAny(aGen, bGen));
}

function disagree(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size > 0 && b.size > 0 && !sharesAny(a, b);
}

export type MatchConflict = "brand" | "model" | "variant" | "number" | "condition";

/**
 * Hard evidence the titles describe different products: different brands,
 * different model codes ("P3" vs "P2"), different variants of one unit
 * ("6 Qt" vs "8 Qt", "6-Pack" vs "12 Pack") or different series numbers
 * ("Flip 6" vs "Flip 7"), or a refurbished/used/bundle listing against a plain one.
 */
export function findConflict(a: TitleTokens, b: TitleTokens): MatchConflict | null {
  if (disagree(a.brands, b.brands)) return "brand";
  if (a.qualifiers.size !== b.qualifiers.size || [...a.qualifiers].some((q) => !b.qualifiers.has(q)))
    return "condition";
  if (a.models.size > 0 && b.models.size > 0 && !sharesModel(a.models, b.models)) return "model";
  for (const [unit, values] of a.variants) {
    const other = b.variants.get(unit);
    if (other && disagree(values, other)) return "variant";
  }
  if (disagree(a.numbers, b.numbers)) return "number";
  return null;
}

/**
 * Decides whether two listings from different stores are the same product.
 * Returns null for "not a match". Rules, in order:
 * 1. Same store → never (a group holds one offer per store).
 * 2. One is an accessory and the other isn't ("case for AirPods" ≠ "AirPods").
 * 3. Prices too far apart → different products.
 * 4. Any conflict (brand, model, variant, series number) → different products.
 * 5. Accessories → only a high title-similarity bar. Their model codes name the
 *    product they fit ("for WH-1000XM5"), which dozens of different ear pads share.
 * 6. A shared model code → the shorter title must mostly appear in the longer one.
 * 7. A model code on one side only, and a brand → no: the other title could be any
 *    of the brand's models.
 * 8. A shared series number or generation of a branded product, and no model codes
 *    → the shorter title must almost all appear in the longer one.
 * 9. Otherwise → a high title-similarity bar.
 */
export function matchProducts(
  a: MatchCandidate,
  b: MatchCandidate,
  policy: MatchingPolicy = DEFAULT_MATCHING_POLICY,
): MatchResult | null {
  if (a.product.provider === b.product.provider) return null;
  if (a.tokens.isAccessory !== b.tokens.isAccessory) return null;
  if (priceRatio(a.product, b.product) > policy.maxPriceRatio) return null;
  return matchTitles(a.tokens, b.tokens, policy);
}

/**
 * The title rules of `matchProducts` (2 and 4–9), for listings without a
 * price to compare: a store that lists the item but won't ship it.
 */
export function matchTitles(
  a: TitleTokens,
  b: TitleTokens,
  policy: MatchingPolicy = DEFAULT_MATCHING_POLICY,
): MatchResult | null {
  if (a.isAccessory !== b.isAccessory) return null;
  if (findConflict(a, b)) return null;
  return scoreTitles({ tokens: a }, { tokens: b }, policy);
}

function scoreTitles(
  a: { readonly tokens: TitleTokens },
  b: { readonly tokens: TitleTokens },
  policy: MatchingPolicy,
): MatchResult | null {
  const score = diceSimilarity(a.tokens.words, b.tokens.words);
  const similar =
    score >= policy.minScoreWithoutModel ? ({ basis: "title_similarity", score } as const) : null;
  if (a.tokens.isAccessory) return similar;

  const contained = containment(a.tokens.words, b.tokens.words);
  if (sharesModel(a.tokens.models, b.tokens.models)) {
    return contained >= policy.minContainmentWithModel && score >= policy.minScoreWithModel
      ? { basis: "model_number", score }
      : null;
  }

  const modelCount = (a.tokens.models.size > 0 ? 1 : 0) + (b.tokens.models.size > 0 ? 1 : 0);
  const branded = a.tokens.brands.size > 0 || b.tokens.brands.size > 0;
  // "Sony Wireless Headphones" could be any of Sony's models, so it can't match a WH-1000XM5.
  if (modelCount === 1 && branded) return null;
  if (
    modelCount === 0 &&
    sharesSeries(a.tokens, b.tokens) &&
    contained >= policy.minContainmentWithSeries &&
    score >= policy.minScoreWithModel
  )
    return { basis: "model_number", score };
  return similar;
}

/**
 * Two listings of one product at the same store (different sellers, colours,
 * a bundled case), so they share one card. Stricter than across stores: a
 * shared model code, or near-identical titles under a known brand. Accessories
 * never collapse — a store's dozens of "ear pads for X" are different products.
 */
export function matchSameStore(
  a: MatchCandidate,
  b: MatchCandidate,
  policy: MatchingPolicy = DEFAULT_MATCHING_POLICY,
): MatchResult | null {
  if (a.product.provider !== b.product.provider) return null;
  if (a.tokens.isAccessory || b.tokens.isAccessory) return null;
  if (priceRatio(a.product, b.product) > policy.maxSameStorePriceRatio) return null;
  if (findConflict(a.tokens, b.tokens)) return null;
  // One store's sellers word a model very differently ("NC Headset" vs "Noise Cancelling
  // Headphones"); a long model code they share carries more weight than the wording.
  const longCode = [...a.tokens.models].some(
    (m) => m.length >= 6 && sharesModel(new Set([m]), b.tokens.models),
  );
  const contained = containment(a.tokens.words, b.tokens.words);
  if (longCode && contained >= policy.minSameStoreContainment)
    return { basis: "model_number", score: diceSimilarity(a.tokens.words, b.tokens.words) };
  // Same series of a branded line without model codes ("JBL Flip 6 … Camouflage").
  const noModels = a.tokens.models.size === 0 && b.tokens.models.size === 0;
  if (noModels && sharesSeries(a.tokens, b.tokens) && contained >= policy.minSameStoreSeriesContainment)
    return { basis: "model_number", score: diceSimilarity(a.tokens.words, b.tokens.words) };
  const match = matchTitles(a.tokens, b.tokens, policy);
  if (!match) return null;
  if (match.basis === "model_number") return match;
  const branded = a.tokens.brands.size > 0 || b.tokens.brands.size > 0;
  return branded && match.score >= policy.minSameStoreTitleScore ? match : null;
}

/**
 * Hard evidence two listings can't share a group, whatever else matches:
 * accessory vs product, prices too far apart, or a conflicting brand, model,
 * variant, series number or condition.
 */
export function blocksGrouping(
  a: MatchCandidate,
  b: MatchCandidate,
  policy: MatchingPolicy = DEFAULT_MATCHING_POLICY,
): boolean {
  if (a.tokens.isAccessory !== b.tokens.isAccessory) return true;
  const sameStore = a.product.provider === b.product.provider;
  const limit = sameStore ? policy.maxSameStorePriceRatio : policy.maxPriceRatio;
  if (priceRatio(a.product, b.product) > limit) return true;
  return findConflict(a.tokens, b.tokens) !== null;
}
