import { normalizeQueryText, searchCacheKey } from "@/domain/search/search-query";
import { isProviderId } from "@/domain/shared/provider";

describe("searchCacheKey", () => {
  it("is scoped by destination and provider, versioned for invalidation", () => {
    expect(
      searchCacheKey({ normalizedText: "wireless earbuds", destination: { country: "IL" } }, "temu"),
    ).toBe("search:v2:IL:temu:wireless earbuds");
  });

  it("keeps page 1 unsuffixed and gives each deeper store page its own key", () => {
    const query = { normalizedText: "wireless earbuds", destination: { country: "IL" } } as const;
    expect(searchCacheKey(query, "ebay", 1)).toBe(searchCacheKey(query, "ebay"));
    expect(searchCacheKey(query, "ebay", 2)).toBe("search:v2:IL:ebay:wireless earbuds:p2");
  });

  it("ignores the city so courier estimates don't fragment the cache", () => {
    const a = searchCacheKey({ normalizedText: "x", destination: { country: "IL", city: "Haifa" } }, "ebay");
    const b = searchCacheKey({ normalizedText: "x", destination: { country: "IL" } }, "ebay");
    expect(a).toBe(b);
  });
});

describe("normalizeQueryText", () => {
  it("collapses case and whitespace so equivalent queries share a cache entry", () => {
    expect(normalizeQueryText("  Wireless \t EARBUDS ")).toBe("wireless earbuds");
    expect(
      searchCacheKey({ normalizedText: "Wireless  Earbuds", destination: { country: "IL" } }, "amazon"),
    ).toBe(searchCacheKey({ normalizedText: "wireless earbuds", destination: { country: "IL" } }, "amazon"));
  });

  it("normalizes full-width characters (NFKC)", () => {
    expect(normalizeQueryText("ＡＢＣ")).toBe("abc");
  });
});

describe("isProviderId", () => {
  it("narrows known providers only", () => {
    expect(isProviderId("aliexpress")).toBe(true);
    expect(isProviderId("shein")).toBe(false);
  });
});
