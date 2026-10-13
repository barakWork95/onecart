import { storeChecks, storeSearches } from "@/application/search/store-fallback";
import { groupProducts } from "@/domain/search/product-group";
import type { SearchQuery } from "@/domain/search/search-query";
import type { ProviderOutcome, SearchResponse } from "@/domain/search/search-response";
import type { ProviderId } from "@/domain/shared/provider";
import { makeProduct } from "@/test/product-factory";

const outcome = (
  provider: ProviderId,
  status: ProviderOutcome["status"],
  errorCode?: string,
): ProviderOutcome => ({
  provider,
  status,
  resultCount: 0,
  latencyMs: null,
  fromCache: false,
  ...(errorCode ? { errorCode } : {}),
});

const QUERY: SearchQuery = {
  rawText: "sony wh-1000xm5",
  detectedLanguage: "en",
  normalizedText: "sony wh-1000xm5",
  sort: "relevance",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
};

function response(providers: ProviderOutcome[], groups = groupProducts(PRODUCTS)): SearchResponse {
  return {
    query: QUERY,
    groups,
    totalOffers: 0,
    providers,
    pagination: { page: 1, pageSize: 20, totalResults: groups.length, hasNextPage: false },
    isPartial: true,
    generatedAt: "2026-10-13T09:00:00.000Z",
  };
}

const PRODUCTS = [
  makeProduct({
    provider: "ebay",
    sku: "e1",
    title: "Sony WH-1000XM5 Noise Cancelling Headphones, Black",
    total: 1000_00,
  }),
  makeProduct({ provider: "ebay", sku: "e2", title: "Earpads for Sony WH-1000XM5", total: 40_00 }),
  makeProduct({ provider: "aliexpress", sku: "a1", title: "Soundcore Life P3 Earbuds", total: 90_00 }),
  makeProduct({ provider: "temu", sku: "t1", title: "Soundcore Life P3 Wireless Earbuds", total: 95_00 }),
];

describe("storeChecks", () => {
  it("gives each single-store card a search of Amazon's own site while Amazon's quota is used up", () => {
    const checks = storeChecks(
      response([outcome("amazon", "error", "QUOTA_EXHAUSTED"), outcome("ebay", "ok")]),
    );
    expect(checks["grp:ebay:e1"]).toEqual({
      id: "amazon:search:grp:ebay:e1",
      provider: "amazon",
      url: "https://www.amazon.com/s?k=Sony+WH-1000XM5+Noise+Cancelling+Headphones",
    });
    expect(checks["grp:ebay:e2"]?.url).toBe("https://www.amazon.com/s?k=Earpads");
    // Already compared across two stores: nothing to add.
    expect(checks["grp:aliexpress:a1"]).toBeUndefined();
  });

  it("covers timeouts and an open circuit too, and skips stores without a search page", () => {
    expect(Object.keys(storeChecks(response([outcome("amazon", "timeout")])))).toHaveLength(2);
    expect(Object.keys(storeChecks(response([outcome("amazon", "circuit_open")])))).toHaveLength(2);
    expect(storeChecks(response([outcome("temu", "error")]))).toEqual({});
  });

  it("adds nothing when every store answered, or when the card already notes the store", () => {
    expect(storeChecks(response([outcome("amazon", "ok"), outcome("ebay", "ok")]))).toEqual({});
    const [group] = groupProducts([PRODUCTS[0]!], {
      unavailable: [
        {
          id: "amazon:B1",
          provider: "amazon",
          providerProductId: "B1",
          title: "WH-1000XM5 Wireless Headphones Black",
          productUrl: "https://www.amazon.com/dp/B1",
          imageUrl: null,
          reason: "no_offer_to_destination",
        },
      ],
    });
    expect(storeChecks(response([outcome("amazon", "error")], group ? [group] : []))).toEqual({});
  });
});

describe("storeSearches", () => {
  it("searches each unavailable store's own site for the query, skipping stores without a search page", () => {
    const down = response(
      [outcome("amazon", "error", "QUOTA_EXHAUSTED"), outcome("ebay", "error"), outcome("temu", "timeout")],
      [],
    );
    expect(storeSearches(down)).toEqual([
      {
        id: "amazon:search:sony-wh-1000xm5",
        provider: "amazon",
        url: "https://www.amazon.com/s?k=sony+wh-1000xm5",
      },
      {
        id: "ebay:search:sony-wh-1000xm5",
        provider: "ebay",
        url: "https://www.ebay.com/sch/i.html?_nkw=sony+wh-1000xm5",
      },
    ]);
    expect(storeSearches(response([outcome("amazon", "ok")]))).toEqual([]);
    // Ids stay URL-safe whatever the query holds.
    const hebrew = {
      ...response([outcome("amazon", "error")], []),
      query: { ...QUERY, normalizedText: "עגלה & stroller 2/pack" },
    };
    expect(storeSearches(hebrew)[0]?.id).toBe("amazon:search:stroller-2-pack");
  });
});
