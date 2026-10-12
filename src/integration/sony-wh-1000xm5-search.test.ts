import { createSearchProducts } from "@/application/search/search-products";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import type { SearchQuery, SearchSort } from "@/domain/search/search-query";
import { ok } from "@/domain/shared/result";
import {
  createInMemoryCircuitBreakerStore,
  createInMemorySearchCache,
} from "@/infrastructure/cache/in-memory-stores";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import amazonPage1 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5.json";
import amazonPage2 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5-p2.json";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
import ebaySearch from "@/infrastructure/providers/ebay/fixtures/recorded-sony-wh-1000xm5.json";
import { TEST_FX } from "@/test/fx";

/**
 * The live responses for "sony wh-1000xm5" (recorded 2026-10-12), through the
 * real adapters and orchestrator. What the stores returned:
 * - Amazon lists the headphones (black, blue, silver…) but has no offer that
 *   ships them to Israel; its product page says "This item cannot be shipped
 *   to your selected delivery location". Its only priced items are ear covers,
 *   a hard case, ear pads, a hinge and unrelated earbuds.
 * - eBay has ~20 listings of the headphones (₪660–₪1,750) mixed with parts.
 * Before this fix, the results opened with a ₪25 pair of wired earbuds and
 * ear pads, and the headphones were scattered among parts.
 */
const query = (sort: SearchSort = "relevance"): SearchQuery => ({
  rawText: "sony wh-1000xm5",
  detectedLanguage: "en",
  normalizedText: "sony wh-1000xm5",
  sort,
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 100,
});

function search(sort?: SearchSort) {
  const amazon = createAmazonProvider({
    apiKey: "k",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: async (input) =>
      new Response(
        JSON.stringify(new URL(String(input)).searchParams.get("page") === "2" ? amazonPage2 : amazonPage1),
      ),
  });
  const ebay = createEbayProvider({
    tokens: { getToken: async () => ok("token"), invalidate: () => undefined },
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: async () => new Response(JSON.stringify(ebaySearch)),
  });
  return createSearchProducts({
    providers: [amazon, ebay],
    cache: createInMemorySearchCache(),
    circuitBreaker: createInMemoryCircuitBreakerStore(),
  })(query(sort));
}

const shekels = (g: ProductGroup) => bestOffer(g).price.item.amountMinor / 100;
const isHeadphones = (g: ProductGroup) => /wh-?1000xm5/i.test(g.title) && shekels(g) >= 600;

describe("“sony wh-1000xm5” on recorded live results", () => {
  it("opens with the headphones, compared with Amazon's “won't ship to Israel”", async () => {
    const { groups } = await search();
    const [top] = groups;
    expect(top && isHeadphones(top)).toBe(true);
    expect(top?.offers.map((o) => o.provider)).toEqual(["ebay"]);
    expect(top?.unavailable).toEqual([
      expect.objectContaining({ provider: "amazon", reason: "no_offer_to_destination" }),
    ]);
    expect(top?.unavailable[0]?.title).toMatch(/^WH-1000XM5 /);
  });

  it("lists every headphone listing before any related product or accessory", async () => {
    const { groups } = await search();
    const firstOther = groups.findIndex((g) => !g.onIntent || g.isAccessory);
    const headphones = groups.filter(isHeadphones);
    expect(headphones.length).toBeGreaterThanOrEqual(15);
    expect(groups.slice(0, firstOther).every(isHeadphones)).toBe(true);
    expect(groups.slice(firstOther).some(isHeadphones)).toBe(false);
  });

  it("recognises the headphones sold with a case, and the parts sold under the model name", async () => {
    const { groups } = await search();
    const byTitle = (pattern: RegExp) => groups.filter((g) => pattern.test(g.title));
    // "Hard Case"/"Soft Case" in the title, but headphone prices: the product.
    for (const g of byTitle(/WH-1000XM5(SA)? (Hard|Soft) Case/)) expect(g.isAccessory).toBe(false);
    // Model name first, no "for": still parts, judged by price.
    for (const g of byTitle(/Hinge Swivel Bracket|Charging Port|Ear Pad|Earpads|Battery/))
      expect(g.isAccessory).toBe(true);
    // Unrelated earbuds Amazon ranked first are related items, below the headphones.
    expect(byTitle(/^Wired Earbuds/).every((g) => !g.onIntent && !g.isAccessory)).toBe(true);
  });

  it("sorts by price within the headphones, so the cheapest pair comes first, not a ₪25 part", async () => {
    const { groups } = await search("landed_price_asc");
    const [cheapest] = groups;
    expect(cheapest && isHeadphones(cheapest)).toBe(true);
    const headphoneTotals = groups.filter(isHeadphones).map((g) => bestOffer(g).price.total.amountMinor);
    expect(headphoneTotals).toEqual([...headphoneTotals].sort((a, b) => a - b));
  });
});
