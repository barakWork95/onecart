import { searchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";

/** Listings per store whose photos are hashed for one generic search. */
export const PHOTOS_PER_STORE = 25;

/**
 * Photo URLs to hash after warming a search: only for generic searches (the
 * ones generic matching compares by photo), the stores' top listings first.
 * Branded searches never need photo hashes.
 */
export function photoUrlsToHash(response: SearchResponse, perStore = PHOTOS_PER_STORE): string[] {
  if (searchIntent(response.query.normalizedText).mode !== "generic") return [];
  const taken = new Map<string, number>();
  const urls: string[] = [];
  for (const product of response.groups.flatMap((g) => g.listings)) {
    const n = taken.get(product.provider) ?? 0;
    if (!product.imageUrl || n >= perStore) continue;
    taken.set(product.provider, n + 1);
    urls.push(product.imageUrl);
  }
  return [...new Set(urls)];
}
