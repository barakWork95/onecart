import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import { TEST_FX } from "@/test/fx";
import page1 from "./fixtures/recorded-wireless-headphones.json";
import page2 from "./fixtures/recorded-wireless-headphones-p2.json";

/**
 * Real SerpApi responses for "wireless headphones" shipped to Israel
 * (recorded 2026-10-12, trimmed). Most organic items come back with no
 * price (`no_featured_offers`): Amazon has no offer that ships them to Israel.
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

function provider(pages?: number) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const page = new URL(String(input)).searchParams.get("page");
    return new Response(JSON.stringify(page === "2" ? page2 : page1));
  });
  const amazon = createAmazonProvider({
    apiKey: "k",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: fetchMock,
    now: () => new Date("2026-10-12T09:00:00.000Z"),
    ...(pages ? { pages } : {}),
  });
  return { amazon, fetchMock };
}

describe("Amazon adapter — recorded live responses", () => {
  it("keeps every priced item from organic results AND the featured carousels", async () => {
    const { amazon } = provider(1);
    const result = await amazon.search(QUERY, { signal: new AbortController().signal });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1 priced organic + 10 priced carousel entries (8 unique) = 9 products.
    // The old adapter ignored the carousels and returned only the 1.
    expect(result.value).toHaveLength(9);
    expect(result.value[0]?.providerProductId).toBe("B0HFMYDH5X");
  });

  it("fetches two pages in parallel by default for a fuller result set", async () => {
    const { amazon, fetchMock } = provider();
    const result = await amazon.search(QUERY, { signal: new AbortController().signal });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Page 2 adds 7 priced organic + 5 carousel entries; 18 unique products in total.
    expect(result.ok && result.value.length).toBe(18);
    if (!result.ok) return;
    expect(new Set(result.value.map((p) => p.id)).size).toBe(result.value.length);
    expect(result.value.every((p) => p.price.total.currency === "ILS" && p.price.total.amountMinor > 0)).toBe(
      true,
    );
  });
});

it("keeps Amazon's relevance order: organic results of every page before carousel items", async () => {
  const { amazon } = provider();
  const result = await amazon.search(QUERY, { signal: new AbortController().signal });
  if (!result.ok) throw new Error("expected results");
  const organicIds = new Set(
    [...page1.organic_results, ...page2.organic_results]
      .filter((i) => "extracted_price" in i)
      .map((i) => `amazon:${i.asin}`),
  );
  const firstCarousel = result.value.findIndex((p) => !organicIds.has(p.id));
  expect(result.value.slice(0, firstCarousel).every((p) => organicIds.has(p.id))).toBe(true);
  expect(result.value.slice(firstCarousel).every((p) => !organicIds.has(p.id))).toBe(true);
});
