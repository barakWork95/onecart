import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { money } from "@/domain/shared/money";
import {
  createAmazonProvider,
  type AmazonProviderConfig,
} from "@/infrastructure/providers/amazon/amazon-adapter";
import { TEST_FX } from "@/test/fx";
import errorInvalidKey from "./fixtures/error-invalid-key.json";
import searchNoResults from "./fixtures/search-no-results.json";
import searchOk from "./fixtures/search-ok.json";

const QUERY: SearchQuery = {
  rawText: "earbuds",
  detectedLanguage: "en",
  normalizedText: "wireless earbuds",
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 3,
  pageSize: 20,
};
const NOW = new Date("2026-10-11T09:00:00.000Z");
const ils = (agorot: number) => money(agorot, "ILS");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(
  respond: (url: URL, init?: RequestInit) => Promise<Response>,
  overrides: Partial<AmazonProviderConfig> = {},
) {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    respond(new URL(String(input)), init),
  );
  const provider = createAmazonProvider({
    apiKey: "serp-secret",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: fetchMock,
    now: () => NOW,
    ...overrides,
  });
  return {
    provider,
    fetchMock,
    search: () => provider.search(QUERY, { signal: new AbortController().signal }),
  };
}

describe("Amazon adapter — request", () => {
  it("queries SerpApi's Amazon engine for amazon.com, shipping to Israel", async () => {
    const { fetchMock, search } = setup(async () => json(searchNoResults));
    await search();
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://serpapi.com/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "amazon",
      amazon_domain: "amazon.com",
      language: "en_US",
      k: "wireless earbuds",
      shipping_location: "IL",
      api_key: "serp-secret",
    });
  });

  it("lets config override the shipping location format", async () => {
    const { fetchMock, search } = setup(async () => json(searchNoResults), { shippingLocation: "il" });
    await search();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("shipping_location")).toBe("il");
  });
});

describe("Amazon adapter — results", () => {
  it("maps, de-duplicates sponsored repeats, and drops unpriced items", async () => {
    const result = await setup(async () => json(searchOk)).search();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.map((p) => p.providerProductId)).toEqual([
      "B08KW1KR5H",
      "B0BS1QCFHX",
      "B09B8V1LZ3",
      "B0CABLE123",
      "B0KINDLE01",
    ]);
    const byAsin = Object.fromEntries(result.value.map((p) => [p.providerProductId, p]));

    expect(byAsin.B08KW1KR5H?.price.total).toEqual(ils(142_04));
    expect(byAsin.B0BS1QCFHX).toMatchObject({
      price: { importVat: ils(67_92), total: ils(445_28) },
      delivery: { minDays: 6, maxDays: 10 },
      originalPrice: ils(554_96),
      rating: { average: 4.4, count: 12840 },
    });
    expect(byAsin.B09B8V1LZ3).toMatchObject({
      price: { total: ils(184_96) },
      delivery: { isFreeShipping: true, maxDays: 8 },
    });
    expect(byAsin.B0CABLE123?.price).toMatchObject({ shippingKnown: false, total: ils(36_96) });
    expect(byAsin.B0KINDLE01?.price).toMatchObject({ taxesCollectedAtCheckout: true, total: ils(708_21) });
    expect(
      result.value.every((p) => p.productUrl === `https://www.amazon.com/dp/${p.providerProductId}`),
    ).toBe(true);
  });

  it("treats SerpApi's 'no results' message as an empty result, not an error", async () => {
    expect(await setup(async () => json(searchNoResults)).search()).toEqual({ ok: true, value: [] });
  });

  it("returns an empty list when organic_results is absent", async () => {
    expect(await setup(async () => json({ search_metadata: { status: "Success" } })).search()).toEqual({
      ok: true,
      value: [],
    });
  });
});

describe("Amazon adapter — failures never throw", () => {
  it("maps an invalid key (401) to unauthorized with SerpApi's message as internal detail", async () => {
    expect(await setup(async () => json(errorInvalidKey, 401)).search()).toEqual({
      ok: false,
      error: {
        provider: "amazon",
        kind: "unauthorized",
        code: "HTTP_401",
        retryable: false,
        detail: errorInvalidKey.error,
      },
    });
  });

  it.each([
    [403, "unauthorized", false],
    [429, "rate_limited", true],
    [500, "upstream_error", true],
    [503, "upstream_error", true],
  ] as const)("maps HTTP %i to %s", async (status, kind, retryable) => {
    expect(await setup(async () => json({}, status)).search()).toMatchObject({
      ok: false,
      error: { kind, retryable, code: `HTTP_${status}` },
    });
  });

  it("maps an HTTP error with a non-JSON body by status", async () => {
    expect(await setup(async () => new Response("Bad Gateway", { status: 502 })).search()).toMatchObject({
      ok: false,
      error: { kind: "upstream_error", code: "HTTP_502" },
    });
  });

  it("maps other SerpApi errors on a 200 to upstream_error", async () => {
    expect(
      await setup(async () => json({ error: "Amazon is temporarily unavailable." })).search(),
    ).toMatchObject({
      ok: false,
      error: { kind: "upstream_error", code: "SERPAPI_ERROR", detail: "Amazon is temporarily unavailable." },
    });
  });

  it("returns parse_error for a non-JSON 200, a wrong shape, or all items invalid", async () => {
    expect(await setup(async () => new Response("<html>")).search()).toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });
    expect(await setup(async () => json({ organic_results: "nope" })).search()).toMatchObject({
      ok: false,
      error: { code: "PARSE_ERROR" },
    });
    expect(
      await setup(async () => json({ organic_results: [{ asin: "bad" }, { title: "x" }] })).search(),
    ).toMatchObject({
      ok: false,
      error: { code: "ALL_ITEMS_INVALID", retryable: false },
    });
  });

  it("maps network failures and timeouts", async () => {
    expect(await setup(() => Promise.reject(new TypeError("fetch failed"))).search()).toMatchObject({
      ok: false,
      error: { kind: "upstream_error", code: "NETWORK", detail: "fetch failed" },
    });
    expect(await setup(() => Promise.reject("socket")).search()).toMatchObject({
      ok: false,
      error: { detail: "socket" },
    });

    const hanging = setup(
      (_url, init) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
      { timeoutMs: 5 },
    );
    expect(await hanging.search()).toMatchObject({
      ok: false,
      error: { kind: "timeout", code: "TIMEOUT", retryable: true },
    });
  });

  it("fails without blaming Amazon when exchange rates are unavailable", async () => {
    const { search } = setup(async () => json(searchOk), {
      getFxRates: () => Promise.reject(new Error("rates down")),
    });
    expect(await search()).toMatchObject({
      ok: false,
      error: { code: "FX_UNAVAILABLE", retryable: false, detail: "rates down" },
    });
    const other = setup(async () => json(searchOk), { getFxRates: () => Promise.reject("down") });
    expect(await other.search()).toMatchObject({ ok: false, error: { detail: "down" } });
  });

  it("never puts the API key in error details", async () => {
    const result = await setup(() => Promise.reject(new TypeError("fetch failed"))).search();
    expect(JSON.stringify(result)).not.toContain("serp-secret");
  });

  it("identifies as the amazon provider", () => {
    expect(setup(async () => json(searchNoResults)).provider.id).toBe("amazon");
  });
});
