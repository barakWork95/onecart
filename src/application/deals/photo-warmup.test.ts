import { photoUrlsToHash } from "@/application/deals/photo-warmup";
import { assembleResults } from "@/application/search/assemble-results";
import { searchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { makeProduct } from "@/test/product-factory";

function response(query: string, products: ReturnType<typeof makeProduct>[]): SearchResponse {
  const { groups } = assembleResults(
    [{ products, unavailable: [] }],
    { filters: {}, sort: "relevance" },
    searchIntent(query),
  );
  return {
    query: {
      rawText: query,
      detectedLanguage: "en",
      normalizedText: query,
      sort: "relevance",
      filters: {},
      destination: { country: "IL" },
      page: 1,
      pageSize: 20,
    },
    groups,
    totalOffers: products.length,
    providers: [],
    pagination: { page: 1, pageSize: 20, totalResults: groups.length, hasNextPage: false },
    isPartial: false,
    generatedAt: "2026-10-18T07:30:00.000Z",
  };
}

describe("photoUrlsToHash", () => {
  const peelers = [
    makeProduct({
      provider: "ebay",
      sku: "e1",
      title: "Vegetable Peeler Stainless Steel",
      imageUrl: "https://i.ebayimg.com/1.jpg",
    }),
    makeProduct({
      provider: "ebay",
      sku: "e2",
      title: "Y Peeler Swivel Blade",
      imageUrl: "https://i.ebayimg.com/2.jpg",
    }),
    makeProduct({ provider: "ebay", sku: "e3", title: "Julienne Peeler", imageUrl: null }),
    makeProduct({
      provider: "aliexpress",
      sku: "a1",
      title: "Vegetable Peeler Kitchen Gadget",
      imageUrl: "https://ae01.alicdn.com/1.jpg",
    }),
  ];

  it("takes each store's top listings with a photo, for a generic search", () => {
    expect(photoUrlsToHash(response("vegetable peeler", peelers), 1).sort()).toEqual([
      "https://ae01.alicdn.com/1.jpg",
      "https://i.ebayimg.com/1.jpg",
    ]);
    expect(photoUrlsToHash(response("vegetable peeler", peelers))).toHaveLength(3);
  });

  it("hashes nothing for a branded search", () => {
    expect(photoUrlsToHash(response("oxo good grips peeler", peelers))).toEqual([]);
  });
});
