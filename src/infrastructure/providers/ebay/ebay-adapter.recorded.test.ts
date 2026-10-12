import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { ok } from "@/domain/shared/result";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
import { TEST_FX } from "@/test/fx";
import recorded from "./fixtures/recorded-wireless-headphones.json";

/**
 * Real Browse API response for "wireless headphones" delivered to Israel
 * (recorded 2026-10-12 with the production keyset, trimmed to 20 items).
 * eBay converts every price and shipping cost to ILS from the seller's
 * currency (USD, CAD, AUD, EUR, GBP).
 */
const QUERY: SearchQuery = {
  rawText: "wireless headphones",
  detectedLanguage: "en",
  normalizedText: "wireless headphones",
  sort: "relevance",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
};

describe("eBay adapter — recorded live response", () => {
  it("maps every live listing with a ₪ price, image, and quoted shipping to Israel", async () => {
    const ebay = createEbayProvider({
      tokens: { getToken: async () => ok("token"), invalidate: () => undefined },
      importPolicy: ISRAEL_IMPORT_POLICY,
      getFxRates: async () => TEST_FX,
      fetch: async () => new Response(JSON.stringify(recorded)),
      now: () => new Date("2026-10-12T09:00:00.000Z"),
    });
    const result = await ebay.search(QUERY, { signal: new AbortController().signal });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.products).toHaveLength(recorded.itemSummaries.length);
    for (const product of result.value.products) {
      expect(product.price.listed.currency).toBe("ILS");
      expect(product.price.total.amountMinor).toBeGreaterThan(0);
      expect(product.price.shippingKnown).toBe(true);
      expect(product.productUrl).toMatch(/^https:\/\/www\.ebay\.com\/itm\/\d+$/);
      expect(product.imageUrl).toMatch(/^https:\/\/i\.ebayimg\.com\//);
      expect(product.title.length).toBeGreaterThan(0);
    }
  });
});
