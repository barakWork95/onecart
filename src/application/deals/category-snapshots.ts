import type { CategoryPage, CategoryProduct } from "@/application/deals/category-page";
import type { CategorySnapshotStore } from "@/domain/deals/ports";
import { noopLogger, type Logger } from "@/domain/shared/logger";

/** How long a snapshot may stand in for a thin page; after that the page really is thin. */
export const SNAPSHOT_MAX_AGE_DAYS = 14;
/** A loaded snapshot is reused this long per instance (crawlers during an outage). */
const LOAD_MEMO_MS = 5 * 60 * 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isCategoryProduct(v: unknown): v is CategoryProduct {
  if (!isRecord(v) || typeof v.label !== "string" || !isRecord(v.bestListing)) return false;
  const { id, provider, productUrl, price } = v.bestListing;
  return (
    typeof id === "string" &&
    typeof provider === "string" &&
    typeof productUrl === "string" &&
    isRecord(price) &&
    isRecord(price.total)
  );
}

/** A snapshot we wrote ourselves, checked enough that a bad row can't break the page. */
function isSnapshotPage(v: unknown): v is CategoryPage {
  return (
    isRecord(v) &&
    v.indexable === true &&
    Array.isArray(v.products) &&
    v.products.every(isCategoryProduct) &&
    (v.pricesAsOf === null || typeof v.pricesAsOf === "string")
  );
}

/**
 * Category pages are for search engines, so a temporary empty cache (a Redis
 * outage, a deploy, results that expired before the warm-up) must not flip one
 * to `noindex`. The warm-up saves each indexable page; a thin build falls back
 * to that copy while it's under `SNAPSHOT_MAX_AGE_DAYS` old. Its products keep
 * their own "Prices as of" dates. Store failures never fail the page or the run.
 */
export function createCategorySnapshots(deps: {
  readonly store: CategorySnapshotStore;
  readonly now?: () => number;
  readonly logger?: Logger;
}) {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;
  const loaded = new Map<string, { snapshot: CategoryPage | null; atMs: number }>();
  const warn = (operation: string, slug: string, error: unknown) =>
    logger.warn(`category snapshots: ${operation} failed`, {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });

  async function recentSnapshot(slug: string): Promise<CategoryPage | null> {
    const memo = loaded.get(slug);
    if (memo && now() - memo.atMs < LOAD_MEMO_MS) return memo.snapshot;
    let snapshot: CategoryPage | null = null;
    try {
      const row = await deps.store.load(slug);
      const ageMs = row ? now() - Date.parse(row.savedAt) : Infinity;
      if (row && ageMs <= SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 && isSnapshotPage(row.page))
        snapshot = row.page;
    } catch (error) {
      warn("load", slug, error);
    }
    loaded.set(slug, { snapshot, atMs: now() });
    return snapshot;
  }

  return {
    /** The fresh page, or its recent snapshot when the fresh one is thin. */
    async withFallback(fresh: CategoryPage): Promise<CategoryPage> {
      if (fresh.indexable) return fresh;
      const snapshot = await recentSnapshot(fresh.category.slug);
      if (!snapshot) return fresh;
      logger.warn("category snapshots: thin page, serving the last indexable copy", {
        slug: fresh.category.slug,
        pricesAsOf: snapshot.pricesAsOf,
      });
      // Today's copy (labels, SEO text) with the snapshot's products.
      return { ...snapshot, category: fresh.category };
    },

    /** Keeps an indexable page as its category's fallback. True when saved. */
    async save(page: CategoryPage): Promise<boolean> {
      if (!page.indexable) return false;
      try {
        await deps.store.save(page.category.slug, page, new Date(now()).toISOString());
        loaded.delete(page.category.slug);
        return true;
      } catch (error) {
        warn("save", page.category.slug, error);
        return false;
      }
    },
  };
}
