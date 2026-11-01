import { createCategoryPage, type CategoryPage } from "@/application/deals/category-page";
import { createCategorySnapshots, SNAPSHOT_MAX_AGE_DAYS } from "@/application/deals/category-snapshots";
import type { Category } from "@/domain/deals/category";
import type { CategorySnapshotStore } from "@/domain/deals/ports";
import { searchCacheKey } from "@/domain/search/search-query";
import { fakeSearchCache } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

const NOW = Date.parse("2026-11-01T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const QUERIES = ["jbl charge 5", "jbl clip 5", "sony srs-xb100"];
const CATEGORY: Category = {
  slug: "speakers",
  mode: "branded",
  label: "Speakers",
  seoTitle: "Bluetooth speakers: prices in Israel compared",
  description: "Speakers compared.",
  intro: "Portable speakers compared.",
  searchQuery: "bluetooth speaker",
  products: QUERIES.map((query) => ({ label: query.toUpperCase(), query })),
  he: { label: "רמקולים", seoTitle: "רמקולים", description: "רמקולים", intro: "רמקולים", products: {} },
};

/** A real category page built from `cached` of the category's queries. */
async function pageWith(cached: readonly string[]): Promise<CategoryPage> {
  const cache = fakeSearchCache(() => NOW);
  for (const query of cached)
    await cache.set(
      searchCacheKey({ normalizedText: query, destination: { country: "IL" } }, "ebay", 1),
      {
        products: [makeProduct({ provider: "ebay", sku: query, title: `${query} speaker`, total: 300_00 })],
        hasMore: false,
        cachedAt: "2026-10-30T07:30:00.000Z",
      },
      86_400,
    );
  return createCategoryPage({ cache, stores: [{ id: "ebay" }] })(CATEGORY);
}

function memoryStore(): CategorySnapshotStore & { saved: Map<string, { page: unknown; savedAt: string }> } {
  const saved = new Map<string, { page: unknown; savedAt: string }>();
  return {
    saved,
    load: jest.fn(async (slug: string) => saved.get(slug) ?? null),
    save: jest.fn(async (slug: string, page: object, savedAt: string) => {
      saved.set(slug, JSON.parse(JSON.stringify({ page, savedAt })));
    }),
  };
}

describe("category snapshots", () => {
  it("serves a thin page from a recent indexable snapshot, so a temporary empty cache never means noindex", async () => {
    const good = await pageWith(QUERIES);
    const thin = await pageWith([]);
    const store = memoryStore();
    const snapshots = createCategorySnapshots({ store, now: () => NOW });
    await snapshots.save(good);

    const page = await snapshots.withFallback(thin);
    expect(page.indexable).toBe(true);
    expect(page.products.map((p) => p.label)).toEqual(good.products.map((p) => p.label));
    // Its prices keep their own dates: the page says how old they are.
    expect(page.pricesAsOf).toBe(good.pricesAsOf);
  });

  it("keeps the current category copy (labels, SEO text) over the snapshot's", async () => {
    const store = memoryStore();
    const snapshots = createCategorySnapshots({ store, now: () => NOW });
    await snapshots.save(await pageWith(QUERIES));
    const renamed = { ...CATEGORY, seoTitle: "Speakers, compared" };
    const page = await snapshots.withFallback({ ...(await pageWith([])), category: renamed });
    expect(page.category.seoTitle).toBe("Speakers, compared");
  });

  it("leaves a fresh indexable page alone, without reading the store", async () => {
    const store = memoryStore();
    const fresh = await pageWith(QUERIES);
    expect(await createCategorySnapshots({ store, now: () => NOW }).withFallback(fresh)).toBe(fresh);
    expect(store.load).not.toHaveBeenCalled();
  });

  it(`stops covering a page whose snapshot is over ${SNAPSHOT_MAX_AGE_DAYS} days old: then it's really thin`, async () => {
    const store = memoryStore();
    await createCategorySnapshots({ store, now: () => NOW - (SNAPSHOT_MAX_AGE_DAYS + 1) * DAY }).save(
      await pageWith(QUERIES),
    );
    const thin = await pageWith(["jbl clip 5"]);
    expect(await createCategorySnapshots({ store, now: () => NOW }).withFallback(thin)).toBe(thin);
  });

  it("never saves a thin page, and ignores a snapshot that doesn't look like a page", async () => {
    const store = memoryStore();
    const snapshots = createCategorySnapshots({ store, now: () => NOW });
    expect(await snapshots.save(await pageWith(["jbl clip 5"]))).toBe(false);
    expect(store.save).not.toHaveBeenCalled();

    store.saved.set("speakers", { page: { products: "nope" }, savedAt: new Date(NOW).toISOString() });
    const thin = await pageWith([]);
    expect(await snapshots.withFallback(thin)).toBe(thin);
  });

  it("falls back to the fresh page when the store fails, and a failed save never throws", async () => {
    const logger = { warn: jest.fn() };
    const broken: CategorySnapshotStore = {
      load: () => Promise.reject(new Error("db down")),
      save: () => Promise.reject(new Error("db down")),
    };
    const snapshots = createCategorySnapshots({ store: broken, now: () => NOW, logger });
    const thin = await pageWith([]);
    expect(await snapshots.withFallback(thin)).toBe(thin);
    expect(await snapshots.save(await pageWith(QUERIES))).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("remembers a loaded snapshot for a few minutes, so an outage doesn't cost a query per visit", async () => {
    const store = memoryStore();
    const clock = { ms: NOW };
    const snapshots = createCategorySnapshots({ store, now: () => clock.ms });
    await snapshots.save(await pageWith(QUERIES));
    const thin = await pageWith([]);
    await snapshots.withFallback(thin);
    await snapshots.withFallback(thin);
    expect(store.load).toHaveBeenCalledTimes(1);
    clock.ms += 5 * 60_000;
    await snapshots.withFallback(thin);
    expect(store.load).toHaveBeenCalledTimes(2);
  });
});
