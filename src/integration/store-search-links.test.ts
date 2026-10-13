import { storeChecks, storeSearches } from "@/application/search/store-fallback";
import { groupProducts } from "@/domain/search/product-group";
import type { SearchResponse } from "@/domain/search/search-response";
import { createHmacOutboundLinkCodec } from "@/infrastructure/affiliate/outbound-link-codec";
import { makeProduct } from "@/test/product-factory";

/**
 * "Check Amazon" and "Search Amazon" links through the real /go codec. Found
 * live: ids that didn't start with their store ("amazon-search:…") were
 * refused by the codec, so every such link was a 404.
 */
describe("store search links through the real /go codec", () => {
  const groups = groupProducts([
    makeProduct({
      provider: "ebay",
      sku: "e1",
      title: "Sony WH-1000XM5 Noise Cancelling Headphones",
      total: 1000_00,
    }),
    makeProduct({ provider: "amazon", sku: "a1", title: "JBL Flip 6 Portable Speaker", total: 400_00 }),
  ]);
  const down: SearchResponse = {
    query: {
      rawText: "headphones & speakers",
      detectedLanguage: "en",
      normalizedText: "headphones & speakers",
      sort: "relevance",
      filters: {},
      destination: { country: "IL" },
      page: 1,
      pageSize: 20,
    },
    groups,
    totalOffers: 2,
    providers: [
      {
        provider: "amazon",
        status: "error",
        resultCount: 0,
        latencyMs: 90,
        fromCache: false,
        errorCode: "QUOTA_EXHAUSTED",
      },
      {
        provider: "ebay",
        status: "error",
        resultCount: 0,
        latencyMs: 90,
        fromCache: false,
        errorCode: "EBAY_2001",
      },
    ],
    pagination: { page: 1, pageSize: 20, totalResults: 2, hasNextPage: false },
    isPartial: true,
    generatedAt: "2026-10-13T09:00:00.000Z",
  };

  it("every check and search link decodes back to its store and URL", () => {
    const codec = createHmacOutboundLinkCodec("x".repeat(48));
    const targets = [...Object.values(storeChecks(down)), ...storeSearches(down)];
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      const href = new URL(codec.encode(target), "https://onecartapp.com");
      const id = decodeURIComponent(href.pathname.replace(/^\/go\//, ""));
      expect(codec.decode(id, Object.fromEntries(href.searchParams))).toEqual(target);
    }
  });
});
