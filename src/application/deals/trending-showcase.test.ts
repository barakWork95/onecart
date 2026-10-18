import { createTrendingShowcase, warmTrendingSearches } from "@/application/deals/trending-showcase";
import type { SearchProducts } from "@/application/search/search-products";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import { searchCacheKey } from "@/domain/search/search-query";
import type { SearchResponse } from "@/domain/search/search-response";
import { money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { fakeSearchCache } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

const at = { ms: Date.UTC(2026, 9, 13, 7, 30) };
const key = (provider: ProviderId, query: string, scope?: string) =>
  searchCacheKey({ normalizedText: query, destination: { country: "IL" } }, provider, 1, scope);

const xm5 = (sku: string, title: string, total: number) =>
  makeProduct({ provider: "ebay", sku, title, total });
const noOffer: UnavailableListing = {
  id: "amazon:B09XS7JWHH",
  provider: "amazon",
  providerProductId: "B09XS7JWHH",
  title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
  productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
  imageUrl: "https://m.media-amazon.com/images/I/61O3iMlnJIL._AC_SL500_.jpg",
  reason: "no_offer_to_destination",
};

async function seeded() {
  const cache = fakeSearchCache(() => at.ms);
  await cache.set(
    key("ebay", "sony wh-1000xm5"),
    {
      products: [
        xm5("pads", "Earpads for Sony WH-1000XM5", 40_00),
        xm5("a", "Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black", 1012_00),
        xm5("b", "Sony WH-1000XM5SA Wireless Noise Canceling Headphones Silver", 1100_00),
      ],
      hasMore: false,
      cachedAt: "2026-10-13T07:30:00.000Z",
    },
    86_400,
  );
  await cache.set(
    key("amazon", "sony wh-1000xm5", "recorded"),
    { products: [], hasMore: false, unavailable: [noOffer], cachedAt: "2026-10-13T06:00:00.000Z" },
    86_400,
  );
  return cache;
}

describe("trending showcase", () => {
  it("builds a card from cached results: the named product, never its accessories", async () => {
    const showcase = createTrendingShowcase({
      cache: await seeded(),
      stores: [{ id: "ebay" }, { id: "amazon", cacheScope: "recorded" }],
    });
    const [card] = await showcase([{ label: "Sony WH-1000XM5", query: "Sony WH-1000XM5" }]);
    expect(card).toEqual({
      label: "Sony WH-1000XM5",
      query: "sony wh-1000xm5",
      title: "Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black",
      imageUrl: noOffer.imageUrl,
      best: { provider: "ebay", total: money(1012_00, "ILS") },
      stores: [{ provider: "ebay", total: money(1012_00, "ILS"), shippingKnown: true, listings: 2 }],
      unshippedStores: ["amazon"],
      matchedBy: "single",
      lookAlike: false,
      unitPrice: null,
      // The older of the two snapshots: the card is only as fresh as its stalest price.
      pricesAsOf: "2026-10-13T06:00:00.000Z",
    });
  });

  it("groups a generic query's look-alikes by their cached photos, as its search does", async () => {
    const cache = fakeSearchCache(() => at.ms);
    const clip = (provider: ProviderId, sku: string, title: string, total: number) =>
      makeProduct({ provider, sku, title, total, sellerName: null });
    const ebay = clip("ebay", "e1", "Magnetic Cable Holder Clip Organizer", 12_40);
    const ali = clip("aliexpress", "a1", "Magnetic Cable Organizer Clip", 2_99);
    for (const product of [ebay, ali])
      await cache.set(
        key(product.provider, "cable clips"),
        { products: [product], hasMore: false, cachedAt: "2026-10-13T07:30:00.000Z" },
        86_400,
      );
    const photos = new Map([
      [ebay.imageUrl!, "e0b2b6969e9c9c9c"],
      [ali.imageUrl!, "e0b2b6969fb80ed5"],
    ]);
    const showcase = createTrendingShowcase({
      cache,
      stores: [{ id: "ebay" }, { id: "aliexpress" }],
      imageHashes: { cached: () => Promise.resolve(photos) },
    });
    const [card] = await showcase([{ label: "Cable clips", query: "cable clips" }]);
    expect(card).toMatchObject({ matchedBy: "visual_match", best: { provider: "aliexpress" } });
    expect(card?.stores).toHaveLength(2);
  });

  it("leaves out products with nothing cached, or with only accessories cached", async () => {
    const cache = await seeded();
    await cache.set(
      key("ebay", "jbl flip 6"),
      {
        products: [xm5("case", "Case for JBL Flip 6", 50_00)],
        hasMore: false,
        cachedAt: "2026-10-13T07:30:00.000Z",
      },
      86_400,
    );
    const showcase = createTrendingShowcase({ cache, stores: [{ id: "ebay" }] });
    const cards = await showcase([
      { label: "AirPods Pro", query: "airpods pro" },
      { label: "JBL Flip 6", query: "jbl flip 6" },
      { label: "Sony WH-1000XM5", query: "sony wh-1000xm5" },
    ]);
    expect(cards.map((c) => c.label)).toEqual(["Sony WH-1000XM5"]);
  });

  it("only reads the cache, and skips a store whose cache read fails", async () => {
    const logger = { warn: jest.fn() };
    const cache = await seeded();
    const flaky = {
      ...cache,
      get: jest.fn((k: string) => (k.includes("amazon") ? Promise.reject(new Error("down")) : cache.get(k))),
    };
    const showcase = createTrendingShowcase({
      cache: flaky,
      stores: [{ id: "ebay" }, { id: "amazon", cacheScope: "recorded" }],
      logger,
    });
    const [card] = await showcase([{ label: "Sony WH-1000XM5", query: "sony wh-1000xm5" }]);
    expect(card?.unshippedStores).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("showcase: cache read failed", {
      provider: "amazon",
      error: "down",
    });
  });
});

describe("trending showcase — what a homepage card may feature (live listings, 2026-10-14)", () => {
  const at14 = "2026-10-14T08:30:00.000Z";
  const listing = (provider: ProviderId, sku: string, title: string, total: number, sellerName?: string) =>
    makeProduct({ provider, sku, title, total: total * 100, ...(sellerName ? { sellerName } : {}) });

  async function cardFrom(query: string, byStore: Partial<Record<ProviderId, ReturnType<typeof listing>[]>>) {
    const cache = fakeSearchCache(() => at.ms);
    for (const [provider, products] of Object.entries(byStore))
      await cache.set(
        key(provider as ProviderId, query),
        { products, hasMore: false, cachedAt: at14 },
        86_400,
      );
    const stores = (Object.keys(byStore) as ProviderId[]).map((id) => ({ id }));
    const [card] = await createTrendingShowcase({ cache, stores })([{ label: query, query }]);
    return card;
  }

  it("never features a clone that doesn't name the brand", async () => {
    const card = await cardFrom("apple airtag", {
      aliexpress: [
        listing("aliexpress", "a1", "BOROFONE BC104 AirTag Bluetooth Tracker Find My iPhone Compatible", 31),
      ],
      ebay: [
        listing("ebay", "e1", "Apple AirTag | For iPhone & iPad | Tracker for keys, wallet, luggage", 158),
      ],
    });
    expect(card?.best).toEqual({ provider: "ebay", total: money(158_00, "ILS") });
  });

  it("never features a branded AliExpress listing from a non-official store", async () => {
    const card = await cardFrom("jbl go 4", {
      aliexpress: [
        listing(
          "aliexpress",
          "a1",
          "JBL GO 4 Music BRICS 4th Gen Wireless Bluetooth Portable",
          106,
          "Shop1105843138 Store",
        ),
      ],
      ebay: [listing("ebay", "e1", "JBL Go 4 Ultra-Portable Bluetooth Speaker Black Waterproof IP67", 213)],
    });
    expect(card?.best.provider).toBe("ebay");
  });

  it("features a typical-priced listing, skipping the store's top result when it's an outlier", async () => {
    const card = await cardFrom("cosori air fryer", {
      ebay: [
        listing("ebay", "e1", "Cosori Pro Gen 2 5.8-Quart Smart Air Fryer CS168-AF 11-in-1", 3304),
        listing("ebay", "e2", "Cosori Air Fryer 8.6L TwinFry Ash Black", 1330),
        listing("ebay", "e3", "Cosori Air Fryer 5.5L Dual Blaze", 980),
      ],
    });
    expect(card?.best.total).toEqual(money(1330_00, "ILS"));
  });

  it("keeps the brand rule off Amazon, whose catalog titles often drop the brand", async () => {
    const card = await cardFrom("sony wh-1000xm5", {
      amazon: [
        listing("amazon", "z1", "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black", 1100),
      ],
    });
    expect(card?.best.provider).toBe("amazon");
  });
});

describe("warmTrendingSearches", () => {
  it("runs each trending search through the normal search, asking only the given stores", async () => {
    const searchProducts = jest.fn(async (query): Promise<SearchResponse> => ({
      query,
      groups: [],
      totalOffers: 0,
      providers: [
        { provider: "ebay", status: "ok", resultCount: 3, latencyMs: 90, fromCache: false },
        { provider: "amazon", status: "skipped", resultCount: 0, latencyMs: null, fromCache: false },
      ],
      pagination: { page: 1, pageSize: 20, totalResults: 0, hasNextPage: false },
      isPartial: false,
      generatedAt: "2026-10-13T07:30:00.000Z",
    })) as jest.MockedFunction<SearchProducts>;
    const warmed = await warmTrendingSearches(
      searchProducts,
      [
        { label: "Sony WH-1000XM5", query: "Sony WH-1000XM5" },
        { label: "JBL Flip 6", query: "jbl flip 6" },
      ],
      { daily: ["ebay"], rotating: [], atMs: at.ms },
    );
    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(searchProducts.mock.calls[0]?.[0]).toMatchObject({
      normalizedText: "sony wh-1000xm5",
      providers: ["ebay"],
      page: 1,
      sort: "relevance",
    });
    expect(warmed).toEqual([
      { query: "sony wh-1000xm5", outcomes: [{ provider: "ebay", status: "ok" }] },
      { query: "jbl flip 6", outcomes: [{ provider: "ebay", status: "ok" }] },
    ]);
  });

  it("refreshes daily stores for every query and a rotating store for today's slice only", async () => {
    const searchProducts = jest.fn(async (query): Promise<SearchResponse> => ({
      query,
      groups: [],
      totalOffers: 0,
      providers: (query.providers ?? []).map((provider: ProviderId) => ({
        provider,
        status: "ok" as const,
        resultCount: 1,
        latencyMs: 90,
        fromCache: false,
      })),
      pagination: { page: 1, pageSize: 20, totalResults: 0, hasNextPage: false },
      isPartial: false,
      generatedAt: "2026-10-13T07:30:00.000Z",
    })) as jest.MockedFunction<SearchProducts>;
    const queries = ["a", "b", "c", "d", "e"].map((q) => ({ label: q, query: q }));
    const day = 24 * 60 * 60 * 1000;
    // Epoch day 20,374 (2025-10-13 UTC): start = (20374 * 2) % 5 = 3 → "d", "e".
    const atMs = 20_374 * day + 7.5 * 60 * 60 * 1000;

    const warmed = await warmTrendingSearches(searchProducts, queries, {
      // "amazon" listed as daily too: the rotation governs it.
      daily: ["ebay", "amazon"],
      rotating: [{ provider: "amazon", perDay: 2 }],
      atMs,
    });

    expect(warmed.map((w) => [w.query, w.outcomes.map((o) => o.provider)])).toEqual([
      ["a", ["ebay"]],
      ["b", ["ebay"]],
      ["c", ["ebay"]],
      ["d", ["ebay", "amazon"]],
      ["e", ["ebay", "amazon"]],
    ]);
    expect(searchProducts.mock.calls[0]?.[1]).toEqual({ refresh: true, lean: true, cacheTtlSeconds: {} });
    expect(searchProducts.mock.calls[3]?.[1]).toEqual({
      refresh: true,
      lean: true,
      // Every 3 days, kept 3.5 days.
      cacheTtlSeconds: { amazon: 302_400 },
    });
  });

  it("searches nothing for a query no store is asked about", async () => {
    const searchProducts = jest.fn() as jest.MockedFunction<SearchProducts>;
    const warmed = await warmTrendingSearches(searchProducts, [{ label: "a", query: "a" }], {
      daily: [],
      rotating: [{ provider: "amazon", perDay: 0 }],
      atMs: at.ms,
    });
    expect(warmed).toEqual([]);
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("runs up to `concurrency` searches at once and reports in query order", async () => {
    let running = 0;
    let peak = 0;
    const searchProducts = jest.fn(async (query): Promise<SearchResponse> => {
      running++;
      peak = Math.max(peak, running);
      // Later queries finish first, so order can't come from completion order.
      await new Promise((r) => setTimeout(r, 30 - query.normalizedText.charCodeAt(0) + 97));
      running--;
      return {
        query,
        groups: [],
        totalOffers: 0,
        providers: [{ provider: "ebay", status: "ok", resultCount: 1, latencyMs: 1, fromCache: false }],
        pagination: { page: 1, pageSize: 20, totalResults: 0, hasNextPage: false },
        isPartial: false,
        generatedAt: "2026-10-14T07:30:00.000Z",
      };
    }) as jest.MockedFunction<SearchProducts>;
    const queries = ["a", "b", "c", "d", "e", "f", "g"].map((q) => ({ label: q, query: q }));
    const seen: string[] = [];

    const warmed = await warmTrendingSearches(
      searchProducts,
      queries,
      { daily: ["ebay"], rotating: [], atMs: at.ms },
      { concurrency: 3, onWarmed: (query) => seen.push(query) },
    );
    seen.sort();
    expect(peak).toBe(3);
    expect(seen).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(warmed.map((w) => w.query)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});
