import { hammingDistance } from "@/domain/matching/image-hash";
import { attributeConflict, extractAttributes, type ItemAttributes } from "@/domain/matching/item-attributes";
import type { MatchCandidate, MatchResult } from "@/domain/matching/product-matcher";
import { isGenericPair, tokenizeTitle } from "@/domain/matching/title-tokens";

export interface GenericMatchingPolicy {
  /** Across stores: the same item's re-rendered photos measured 9 bits; different items 14+. */
  readonly crossStoreMaxPhotoBits: number;
  /** Within one store sellers reuse the very same photo, so the bar is tighter. */
  readonly sameStoreMaxPhotoBits: number;
  /** Share of the shorter title's core words found in the longer one. */
  readonly minCoreContainment: number;
  /** Item prices (not landed totals): commodity resellers mark up a lot, but not without limit. */
  readonly maxItemPriceRatio: number;
}

/** Calibrated on generic-recorded.json (see generic-recorded.test.ts). */
export const GENERIC_MATCHING_POLICY: GenericMatchingPolicy = {
  crossStoreMaxPhotoBits: 10,
  sameStoreMaxPhotoBits: 6,
  minCoreContainment: 0.5,
  maxItemPriceRatio: 6,
};

/** Marketplace title filler that says nothing about which item it is. */
const FILLER = new Set([
  "new",
  "hot",
  "sale",
  "sell",
  "selling",
  "portable",
  "quality",
  "high",
  "premium",
  "original",
  "upgraded",
  "upgrade",
  "professional",
  "durable",
  "best",
  "cheap",
  "fast",
  "free",
  "shipping",
  "multifunctional",
  "multifunction",
  "creative",
  "practical",
  "household",
  "home",
  "gift",
  "gifts",
  "accessories",
]);

const stem = (word: string) =>
  word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;

/** A title's words that name the item: no filler, no numbers or quantities, singular. */
function coreWords(title: string): ReadonlySet<string> {
  return new Set([...tokenizeTitle(title).words].filter((w) => !/\d/.test(w) && !FILLER.has(w)).map(stem));
}

/** Share of the shorter title's core words found in the longer, 0–1. */
export function coreWordContainment(a: string, b: string): number {
  const x = coreWords(a);
  const y = coreWords(b);
  const smaller = Math.min(x.size, y.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / smaller;
}

// Grouping compares every pair: compute each listing's attributes and core words once.
const attributesOf = new WeakMap<object, ItemAttributes>();
export function attributesFor(c: MatchCandidate): ItemAttributes {
  let found = attributesOf.get(c.product);
  if (!found) attributesOf.set(c.product, (found = extractAttributes(c.product.title)));
  return found;
}

/**
 * Generic (commodity) matching: two listings naming no maker are the
 * same item when every gate holds. A: no conflicting quantity, pack size or
 * colour. B: their photos are within a few bits (cached hashes only). C: they
 * share most core words. D: item prices within 6×. E: both a part, or neither.
 * Null otherwise, including when either listing is branded: those keep the
 * branded rules.
 */
export function matchGeneric(
  a: MatchCandidate,
  b: MatchCandidate,
  policy: GenericMatchingPolicy = GENERIC_MATCHING_POLICY,
): MatchResult | null {
  if (!isGenericPair(a.tokens, b.tokens)) return null;
  if (a.tokens.isAccessory !== b.tokens.isAccessory) return null;
  if (!a.imageHash || !b.imageHash) return null;

  const sameStore = a.product.provider === b.product.provider;
  const distance = hammingDistance(a.imageHash, b.imageHash);
  if (distance > (sameStore ? policy.sameStoreMaxPhotoBits : policy.crossStoreMaxPhotoBits)) return null;
  if (attributeConflict(attributesFor(a), attributesFor(b))) return null;

  const x = a.product.price.item.amountMinor;
  const y = b.product.price.item.amountMinor;
  if (Math.max(x, y) / Math.max(1, Math.min(x, y)) > policy.maxItemPriceRatio) return null;
  if (coreWordContainment(a.product.title, b.product.title) < policy.minCoreContainment) return null;

  return { basis: "visual_match", score: 1 - distance / 64 };
}
