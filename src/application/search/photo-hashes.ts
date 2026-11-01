import { photoUrlsToHash } from "@/application/deals/photo-warmup";
import type { ImageHash, ImageHashIndex } from "@/domain/matching/image-hash";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { SearchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { noopLogger, type Logger } from "@/domain/shared/logger";

/** Reading photo hashes never computes one: that happens off the request path. */
export type PhotoHashReader = Pick<ImageHashIndex, "cached">;

/**
 * The cached photo hashes of a generic search's listings, so unbranded look-alikes can
 * group by photo. Undefined for branded searches (their rules never use photos), with
 * no reader, or when the lookup fails: results then group on titles and specs alone.
 */
export async function photoHashesFor(
  reader: PhotoHashReader | undefined,
  products: readonly UnifiedProduct[],
  intent: SearchIntent,
  logger: Logger = noopLogger,
): Promise<ReadonlyMap<string, ImageHash> | undefined> {
  if (!reader || intent.mode !== "generic") return undefined;
  const urls = products.flatMap((p) => (p.imageUrl ? [p.imageUrl] : []));
  if (urls.length === 0) return undefined;
  try {
    return await reader.cached(urls);
  } catch (error) {
    logger.warn("search: photo hash lookup failed, grouping without photos", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Listings per store whose photos are hashed after a shopper's search: about one
 * results page each, where a look-alike across stores matters most.
 */
export const SEARCH_PHOTOS_PER_STORE = 20;

/** How many photos were hashed, or why none were. */
export type SearchPhotoHashRun = number | "not_needed" | "over_budget" | "error";

/**
 * After a generic search's response is sent: hashes its listings' photos that
 * were never tried, so the next search for it groups look-alikes across stores
 * (the warm-up does the same for its own queries only). Runs only when two or
 * more stores have listings: one store alone has no comparison to find. `allow`
 * is spent once per search with photos to hash (a daily cap on downloads and
 * Redis writes). Never throws.
 */
export function createSearchPhotoHashing(deps: {
  readonly index: Pick<ImageHashIndex, "missing" | "ensure">;
  readonly allow: () => Promise<boolean>;
  readonly perStore?: number;
  readonly logger?: Logger;
}) {
  const perStore = deps.perStore ?? SEARCH_PHOTOS_PER_STORE;
  const logger = deps.logger ?? noopLogger;

  return async function hashSearchPhotos(response: SearchResponse): Promise<SearchPhotoHashRun> {
    const listings = response.groups.flatMap((g) => g.listings);
    if (new Set(listings.map((l) => l.provider)).size < 2) return "not_needed";
    const urls = photoUrlsToHash(response, perStore);
    if (urls.length === 0) return "not_needed";
    try {
      const missing = await deps.index.missing(urls);
      if (missing.length === 0) return "not_needed";
      if (!(await deps.allow())) {
        logger.warn("search photos: over the daily allowance, not hashing", {
          query: response.query.normalizedText,
        });
        return "over_budget";
      }
      return await deps.index.ensure(missing);
    } catch (error) {
      logger.warn("search photos: hashing failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return "error";
    }
  };
}
