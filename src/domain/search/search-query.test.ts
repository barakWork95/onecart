import {
  MAX_QUERY_LENGTH,
  normalizeQueryText,
  sanitizeSearchText,
  searchCacheKey,
} from "@/domain/search/search-query";
import { isProviderId } from "@/domain/shared/provider";

describe("searchCacheKey", () => {
  it("is scoped by destination and provider, versioned for invalidation", () => {
    expect(
      searchCacheKey({ normalizedText: "wireless earbuds", destination: { country: "IL" } }, "temu"),
    ).toBe("search:v3:IL:temu:wireless earbuds");
  });

  it("keeps recorded samples apart from live results", () => {
    const query = { normalizedText: "sony wh-1000xm5", destination: { country: "IL" } } as const;
    expect(searchCacheKey(query, "amazon", 2, "recorded")).toBe(
      "search:v3:IL:amazon@recorded:sony wh-1000xm5:p2",
    );
    expect(searchCacheKey(query, "amazon", 1, "recorded")).not.toBe(searchCacheKey(query, "amazon"));
  });

  it("keeps page 1 unsuffixed and gives each deeper store page its own key", () => {
    const query = { normalizedText: "wireless earbuds", destination: { country: "IL" } } as const;
    expect(searchCacheKey(query, "ebay", 1)).toBe(searchCacheKey(query, "ebay"));
    expect(searchCacheKey(query, "ebay", 2)).toBe("search:v3:IL:ebay:wireless earbuds:p2");
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

describe("sanitizeSearchText", () => {
  it("strips HTML tags and angle brackets, keeping the words", () => {
    expect(sanitizeSearchText("<script>alert(1)</script> jbl flip 6")).toBe("alert(1) jbl flip 6");
    expect(sanitizeSearchText('<img src=x onerror="alert(1)">headphones')).toBe("headphones");
    expect(sanitizeSearchText("a < b > c")).toBe("a b c");
  });

  it("removes control characters, invisible and direction-override characters", () => {
    expect(sanitizeSearchText("jbl\u0000 flip\u0007\t6\n")).toBe("jbl flip 6");
    // Zero-width and bidi overrides can disguise text ("Trojan Source").
    expect(sanitizeSearchText("air\u200Bpods \u202Eorp\u202C")).toBe("airpods orp");
  });

  it("keeps Hebrew, product punctuation and normalizes width and spacing", () => {
    expect(sanitizeSearchText("  אוזניות   סוני  wh-1000xm5 ")).toBe("אוזניות סוני wh-1000xm5");
    expect(sanitizeSearchText("ｊｂｌ　ｆｌｉｐ")).toBe("jbl flip");
    expect(sanitizeSearchText("usb-c 65w & 2/pack, 3.5mm")).toBe("usb-c 65w & 2/pack, 3.5mm");
  });

  it(`cuts at ${MAX_QUERY_LENGTH} characters, at a word boundary when there is one`, () => {
    expect(MAX_QUERY_LENGTH).toBe(100);
    const long = `${"word ".repeat(30)}end`;
    const cut = sanitizeSearchText(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(cut.endsWith("word")).toBe(true);
    expect(sanitizeSearchText("x".repeat(150))).toHaveLength(100);
  });
});
