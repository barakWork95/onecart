import type { ImageHash, ImageHashIndex } from "@/domain/matching/image-hash";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { SearchIntent } from "@/domain/search/search-intent";
import { noopLogger, type Logger } from "@/domain/shared/logger";

/** Reading photo hashes never computes one: that's the warm-up's job. */
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
