import { createCategoryPage, MIN_INDEXABLE_PRODUCTS } from "@/application/deals/category-page";
import type { Category } from "@/domain/deals/category";
import { searchCacheKey } from "@/domain/search/search-query";
import type { ProviderId } from "@/domain/shared/provider";
import { fakeSearchCache } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

const key = (provider: ProviderId, query: string) =>
  searchCacheKey({ normalizedText: query, destination: { country: "IL" } }, provider, 1);

const CATEGORY: Category = {
  slug: "speakers",
  label: "Speakers",
  seoTitle: "Bluetooth speakers: prices in Israel compared",
  description: "Speakers compared.",
  intro: "Portable speakers compared by the full landed price to Israel.",
  searchQuery: "bluetooth speaker",
  products: [
    { label: "JBL Charge 5", query: "jbl charge 5" },
    { label: "JBL Clip 5", query: "jbl clip 5" },
    { label: "Sony SRS-XB100", query: "sony srs-xb100" },
    { label: "Bose SoundLink Micro", query: "bose soundlink micro" },
  ],
};

async function cacheWith(entries: Record<string, { title: string; shekels: number; cachedAt: string }>) {
  const cache = fakeSearchCache(() => Date.parse("2026-10-18T08:00:00.000Z"));
  for (const [query, { title, shekels, cachedAt }] of Object.entries(entries)) {
    await cache.set(
      key("ebay", query),
      {
        products: [makeProduct({ provider: "ebay", sku: query, title, total: shekels * 100 })],
        hasMore: false,
        cachedAt,
      },
      86_400,
    );
  }
  return cache;
}

describe("categoryPage", () => {
  it("features each cached product in the category's order, with its best listing and landed price", async () => {
    const cache = await cacheWith({
      "sony srs-xb100": {
        title: "Sony SRS-XB100 Speaker",
        shekels: 206,
        cachedAt: "2026-10-18T07:31:00.000Z",
      },
      "jbl charge 5": {
        title: "JBL Charge 5 Portable Speaker",
        shekels: 618,
        cachedAt: "2026-10-18T07:30:00.000Z",
      },
    });
    const page = await createCategoryPage({ cache, stores: [{ id: "ebay" }] })(CATEGORY);

    expect(page.products.map((p) => [p.label, p.bestListing.title])).toEqual([
      ["JBL Charge 5", "JBL Charge 5 Portable Speaker"],
      ["Sony SRS-XB100", "Sony SRS-XB100 Speaker"],
    ]);
    const [charge] = page.products;
    expect(charge?.bestListing).toMatchObject({
      id: "ebay:jbl charge 5",
      provider: "ebay",
      productUrl: "https://ebay.example/item/jbl charge 5",
    });
    expect(charge?.bestListing.price.total).toEqual({ amountMinor: 618_00, currency: "ILS" });
    expect(page.pricesAsOf).toBe("2026-10-18T07:30:00.000Z");
  });

  it(`is indexable only with at least ${MIN_INDEXABLE_PRODUCTS} priced products`, async () => {
    const three = await cacheWith({
      "jbl charge 5": { title: "JBL Charge 5 Speaker", shekels: 618, cachedAt: "2026-10-18T07:30:00.000Z" },
      "jbl clip 5": { title: "JBL Clip 5 Speaker", shekels: 240, cachedAt: "2026-10-18T07:30:00.000Z" },
      "sony srs-xb100": {
        title: "Sony SRS-XB100 Speaker",
        shekels: 206,
        cachedAt: "2026-10-18T07:30:00.000Z",
      },
    });
    expect((await createCategoryPage({ cache: three, stores: [{ id: "ebay" }] })(CATEGORY)).indexable).toBe(
      true,
    );

    const two = await cacheWith({
      "jbl charge 5": { title: "JBL Charge 5 Speaker", shekels: 618, cachedAt: "2026-10-18T07:30:00.000Z" },
      "jbl clip 5": { title: "JBL Clip 5 Speaker", shekels: 240, cachedAt: "2026-10-18T07:30:00.000Z" },
    });
    expect((await createCategoryPage({ cache: two, stores: [{ id: "ebay" }] })(CATEGORY)).indexable).toBe(
      false,
    );
  });

  it("renders an empty, unindexed page when nothing is cached yet", async () => {
    const page = await createCategoryPage({ cache: await cacheWith({}), stores: [{ id: "ebay" }] })(CATEGORY);
    expect(page).toEqual({ category: CATEGORY, products: [], indexable: false, pricesAsOf: null });
  });
});
