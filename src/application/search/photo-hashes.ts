import { photoUrlsToHash } from "@/application/deals/photo-warmup";
import type { ImageHash, ImageHashIndex } from "@/domain/matching/image-hash";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProductGroup } from "@/domain/search/product-group";
import type { SearchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { ProviderId } from "@/domain/shared/provider";

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
 * Listings per store whose photos a fresh search fingerprints: the top of each
 * store's results, where a look-alike across stores matters most. Small, so a
 * check costs ≤ 12 downloads and Redis writes and answers in well under a second.
 */
export const SEARCH_PHOTOS_PER_STORE = 6;

/** Where a photo check's time went, in milliseconds. */
export interface PhotoHashTimings {
  /** Finding the missing photos and spending the allowance. */
  readonly check: number;
  /** The whole parallel photo step, by the clock. */
  readonly photos: number;
  /** The slowest single download and Redis write. */
  readonly download: number;
  readonly write: number;
  /** Image processing summed over the photos: CPU they compete for. */
  readonly process: number;
}

/** The new hashes and where the time went, or why nothing was hashed. */
export type SearchPhotoHashRun =
  | {
      readonly kind: "hashed";
      readonly hashes: ReadonlyMap<string, ImageHash>;
      readonly timings: PhotoHashTimings;
    }
  | { readonly kind: "not_needed" | "over_budget" | "error"; readonly timings: PhotoHashTimings };

/** A photo-matched card spanning stores: what a progressive check reports back. */
export interface LookAlikePair {
  readonly listingIds: readonly string[];
  readonly stores: readonly ProviderId[];
}

/** The look-alike groups (photo matches) that compare two or more stores. */
export function lookAlikePairs(groups: readonly ProductGroup[]): LookAlikePair[] {
  return groups
    .filter((g) => g.lookAlike && g.offers.length >= 2)
    .map((g) => ({
      listingIds: g.listings.map((l) => l.id),
      stores: [...new Set(g.offers.map((o) => o.provider))].sort(),
    }));
}

/**
 * Progressive grouping for generic searches. Cached hashes group on the first
 * render; `pending` tells the page whether the top `perStore` photos of each
 * store include some never tried, and `hash` fingerprints them (the client
 * asks for it right after the results show, then refreshes them). Only for
 * listings from two or more stores: one store alone has no comparison to find.
 * `allow` is spent once per search with photos to hash (a daily cap on
 * downloads and Redis writes). Neither ever throws.
 */
export function createSearchPhotoHashing(deps: {
  readonly index: Pick<ImageHashIndex, "missing" | "hash">;
  readonly allow: () => Promise<boolean>;
  readonly perStore?: number;
  readonly logger?: Logger;
}) {
  const perStore = deps.perStore ?? SEARCH_PHOTOS_PER_STORE;
  const logger = deps.logger ?? noopLogger;
  const warn = (message: string, error: unknown) =>
    logger.warn(message, { error: error instanceof Error ? error.message : String(error) });

  /** The photos worth fingerprinting, or none when grouping by photo can't apply. */
  function candidates(response: SearchResponse): string[] {
    const listings = response.groups.flatMap((g) => g.listings);
    if (new Set(listings.map((l) => l.provider)).size < 2) return [];
    return photoUrlsToHash(response, perStore);
  }

  return {
    async pending(response: SearchResponse): Promise<boolean> {
      const urls = candidates(response);
      if (urls.length === 0) return false;
      try {
        return (await deps.index.missing(urls)).length > 0;
      } catch (error) {
        warn("search photos: check failed", error);
        return false;
      }
    },

    async hash(response: SearchResponse): Promise<SearchPhotoHashRun> {
      const started = performance.now();
      const since = (at: number) => Math.round(performance.now() - at);
      const idle = { check: 0, photos: 0, download: 0, write: 0, process: 0 };
      const urls = candidates(response);
      if (urls.length === 0) return { kind: "not_needed", timings: idle };
      try {
        // The allowance comes after the read, so a search with nothing to hash can't spend it.
        const missing = await deps.index.missing(urls);
        if (missing.length === 0) return { kind: "not_needed", timings: { ...idle, check: since(started) } };
        if (!(await deps.allow())) {
          logger.warn("search photos: over the daily allowance, not hashing", {
            query: response.query.normalizedText,
          });
          return { kind: "over_budget", timings: { ...idle, check: since(started) } };
        }
        const check = since(started);
        const photosStarted = performance.now();
        const steps = { download: 0, write: 0, process: 0 };
        const hashes = await deps.index.hash(missing, (step, ms) => {
          steps[step] = step === "process" ? steps[step] + ms : Math.max(steps[step], ms);
        });
        return {
          kind: "hashed",
          hashes,
          timings: {
            check,
            photos: since(photosStarted),
            download: Math.round(steps.download),
            write: Math.round(steps.write),
            process: Math.round(steps.process),
          },
        };
      } catch (error) {
        warn("search photos: hashing failed", error);
        return { kind: "error", timings: { ...idle, check: since(started) } };
      }
    },
  };
}

export type SearchPhotoHashing = ReturnType<typeof createSearchPhotoHashing>;
