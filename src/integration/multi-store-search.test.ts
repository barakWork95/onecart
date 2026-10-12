import { createSearchProducts } from "@/application/search/search-products";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { ok } from "@/domain/shared/result";
import {
  createInMemoryCircuitBreakerStore,
  createInMemorySearchCache,
} from "@/infrastructure/cache/in-memory-stores";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import amazonPage1 from "@/infrastructure/providers/amazon/fixtures/recorded-wireless-headphones.json";
import amazonPage2 from "@/infrastructure/providers/amazon/fixtures/recorded-wireless-headphones-p2.json";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
import ebaySearch from "@/infrastructure/providers/ebay/fixtures/search-ok.json";
import { TEST_FX } from "@/test/fx";

/**
 * The real adapters (Amazon via SerpApi, eBay Browse API) behind the real
 * orchestrator, with HTTP replaced by recorded/fixture responses. Proves the
 * stores are queried in parallel and merged into one "best match" list.
 */
const QUERY: SearchQuery = {
  rawText: "wireless headphones",
  detectedLanguage: "en",
  normalizedText: "wireless headphones",
  sort: "relevance",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 50,
};

function setup() {
  const started: string[] = [];
  const amazonFetch = jest.fn(async (input: RequestInfo | URL) => {
    started.push("amazon");
    const page = new URL(String(input)).searchParams.get("page");
    return new Response(JSON.stringify(page === "2" ? amazonPage2 : amazonPage1));
  });
  const ebayFetch = jest.fn(async () => {
    started.push("ebay");
    return new Response(JSON.stringify(ebaySearch));
  });
  const common = {
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    now: () => new Date("2026-10-12T09:00:00.000Z"),
  };
  const search = createSearchProducts({
    providers: [
      createAmazonProvider({ ...common, apiKey: "k", fetch: amazonFetch }),
      createEbayProvider({
        ...common,
        tokens: { getToken: async () => ok("token"), invalidate: () => undefined },
        fetch: ebayFetch,
      }),
    ],
    cache: createInMemorySearchCache(),
    circuitBreaker: createInMemoryCircuitBreakerStore(),
  });
  return { search, started };
}

describe("multi-store search (Amazon + eBay)", () => {
  it("queries both stores and merges their products into one best-match list", async () => {
    const { search, started } = setup();
    const response = await search(QUERY);

    expect(response.providers.map((p) => [p.provider, p.status, p.resultCount])).toEqual([
      ["amazon", "ok", 18],
      ["ebay", "ok", 4],
    ]);
    expect(response.isPartial).toBe(false);
    expect(response.totalOffers).toBe(22);
    // Every store was started before any finished: parallel fan-out.
    expect(new Set(started)).toEqual(new Set(["amazon", "ebay"]));

    // Best match interleaves the stores' own rankings: both stores' #1 results lead.
    const firstTwo = response.groups
      .slice(0, 2)
      .map((g) => g.offers[0].provider)
      .sort();
    expect(firstTwo).toEqual(["amazon", "ebay"]);
  });

  it("parses eBay titles, prices in ₪, images and shipping to Israel", async () => {
    const { search } = setup();
    const response = await search(QUERY);
    const ebay = response.groups.flatMap((g) => g.offers).filter((o) => o.provider === "ebay");
    expect(ebay.map((o) => o.title)).toContain("Soundcore by Anker Life P3 Noise Cancelling Earbuds Black");
    const p3 = ebay.find((o) => o.providerProductId === "395012345678");
    expect(p3).toMatchObject({
      imageUrl: "https://i.ebayimg.com/images/g/lifep3/s-l500.jpg",
      productUrl: "https://www.ebay.com/itm/395012345678",
      price: { total: { amountMinor: 153_18, currency: "ILS" }, shippingKnown: true },
      // Monday 12 Oct → 25–29 Oct is 9–13 business days.
      delivery: { minDays: 9, maxDays: 13, isFreeShipping: false },
    });
  });

  it("keeps Amazon results when eBay's credentials are rejected, flagging the search as partial", async () => {
    const rejecting = createSearchProducts({
      providers: [
        createAmazonProvider({
          apiKey: "k",
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates: async () => TEST_FX,
          fetch: async (input) => {
            const page = new URL(String(input)).searchParams.get("page");
            return new Response(JSON.stringify(page === "2" ? amazonPage2 : amazonPage1));
          },
        }),
        createEbayProvider({
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates: async () => TEST_FX,
          tokens: {
            getToken: async () => ({ ok: false, error: { kind: "unauthorized", code: "OAUTH_HTTP_401" } }),
            invalidate: () => undefined,
          },
        }),
      ],
      cache: createInMemorySearchCache(),
      circuitBreaker: createInMemoryCircuitBreakerStore(),
    });
    const response = await rejecting(QUERY);
    expect(response.providers.find((p) => p.provider === "ebay")).toMatchObject({
      status: "error",
      errorCode: "OAUTH_HTTP_401",
    });
    expect(response.totalOffers).toBe(18);
    expect(response.isPartial).toBe(true);
  });
});
