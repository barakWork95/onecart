import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { money } from "@/domain/shared/money";
import { err, ok } from "@/domain/shared/result";
import {
  createEbayProvider,
  endUserContext,
  type EbayProviderConfig,
} from "@/infrastructure/providers/ebay/ebay-adapter";
import type { EbayTokenProvider } from "@/infrastructure/providers/ebay/ebay-oauth";
import { TEST_FX } from "@/test/fx";
import errorInvalidFilter from "./fixtures/error-invalid-filter.json";
import errorInvalidToken from "./fixtures/error-invalid-token.json";
import searchEmpty from "./fixtures/search-empty.json";
import searchOk from "./fixtures/search-ok.json";

const QUERY: SearchQuery = {
  rawText: "earbuds",
  detectedLanguage: "en",
  normalizedText: "wireless earbuds",
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
};
const NOW = new Date("2026-10-11T09:00:00.000Z");
const ils = (agorot: number) => money(agorot, "ILS");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeTokens(): EbayTokenProvider & { getToken: jest.Mock; invalidate: jest.Mock } {
  let n = 0;
  return {
    getToken: jest.fn(async () => ok(`token-${++n}`)),
    invalidate: jest.fn(),
  };
}

function setup(
  respond: (url: URL, init?: RequestInit) => Promise<Response>,
  overrides: Partial<EbayProviderConfig> = {},
) {
  const tokens = fakeTokens();
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    respond(new URL(String(input)), init),
  );
  const provider = createEbayProvider({
    tokens,
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    affiliateCampaignId: "5338000000",
    fetch: fetchMock,
    now: () => NOW,
    ...overrides,
  });
  return {
    provider,
    tokens,
    fetchMock,
    search: (q: SearchQuery = QUERY) => provider.search(q, { signal: new AbortController().signal }),
  };
}

describe("endUserContext", () => {
  it("URL-encodes contextualLocation and adds the EPN campaign when configured", () => {
    expect(endUserContext("IL")).toBe("contextualLocation=country%3DIL");
    expect(endUserContext("IL", "5338000000")).toBe(
      "affiliateCampaignId=5338000000,contextualLocation=country%3DIL",
    );
  });
});

describe("eBay adapter — request", () => {
  it("searches new, Buy It Now listings that ship to Israel, with buyer and affiliate context", async () => {
    const { fetchMock, search } = setup(async () => json(searchEmpty));
    await search();

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe("https://api.ebay.com/buy/browse/v1/item_summary/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "wireless earbuds",
      limit: "50",
      filter: "buyingOptions:{FIXED_PRICE},conditionIds:{1000},deliveryCountry:IL",
    });
    expect(init?.headers).toEqual({
      Authorization: "Bearer token-1",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=5338000000,contextualLocation=country%3DIL",
      "Accept-Language": "en-US",
    });
  });

  it("truncates long queries at a word boundary within eBay's 100-character limit", async () => {
    const { fetchMock, search } = setup(async () => json(searchEmpty));
    await search({ ...QUERY, normalizedText: `${"earbuds ".repeat(15)}final` });
    const q = new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("q") ?? "";
    expect(q.length).toBeLessThanOrEqual(100);
    expect(q.endsWith("earbuds")).toBe(true);

    const single = setup(async () => json(searchEmpty));
    await single.search({ ...QUERY, normalizedText: "x".repeat(150) });
    expect(new URL(String(single.fetchMock.mock.calls[0]?.[0])).searchParams.get("q")).toHaveLength(100);
  });
});

describe("eBay adapter — store pages", () => {
  const page = (storePage: number, body: unknown) => {
    const ctx = setup(async () => json(body));
    return {
      ...ctx,
      result: ctx.provider.search(QUERY, { signal: new AbortController().signal, storePage }),
    };
  };
  const offsetOf = (fetchMock: jest.Mock) =>
    new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("offset");

  it("asks for page N with offset (N−1) × limit; page 1 sends no offset", async () => {
    const first = page(1, searchOk);
    await first.result;
    expect(offsetOf(first.fetchMock)).toBeNull();

    const third = page(3, searchOk);
    await third.result;
    expect(offsetOf(third.fetchMock)).toBe("100");
  });

  it("reports more results while offset + items is below eBay's total", async () => {
    const result = await page(1, { total: 1834, itemSummaries: searchOk.itemSummaries }).result;
    expect(result.ok && result.value.hasMore).toBe(true);
  });

  it("reports the last page when the total is reached or nothing came back", async () => {
    const { itemSummaries } = searchOk;
    const last = await page(2, { total: 50 + itemSummaries.length, itemSummaries }).result;
    expect(last.ok && last.value.hasMore).toBe(false);
    const empty = await page(2, { total: 1834 }).result;
    expect(empty.ok && empty.value.hasMore).toBe(false);
  });

  it("stops at the Browse API's 10,000-result ceiling", async () => {
    const { itemSummaries } = searchOk;
    const result = await page(200, { total: 40_000, itemSummaries: itemSummaries.slice(0, 1) }).result;
    // offset 9,950 + 1 item < 10,000, so one more page is still allowed…
    expect(result.ok && result.value.hasMore).toBe(true);
    const full = await page(200, { total: 40_000, itemSummaries: Array(50).fill(itemSummaries[0]) }).result;
    // …but offset 9,950 + 50 reaches it.
    expect(full.ok && full.value.hasMore).toBe(false);
  });
});

describe("eBay adapter — results", () => {
  it("maps fixed-price listings and drops auctions and malformed items", async () => {
    const result = await setup(async () => json(searchOk)).search();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.products.map((p) => p.providerProductId)).toEqual([
      "395012345678",
      "395011112222-601234567890",
      "395033334444",
      "395087654321",
    ]);
    const [p3, sony, keyboard, a40] = result.value.products;
    expect(p3).toMatchObject({
      price: { total: ils(153_18) },
      delivery: { minDays: 10, maxDays: 14 },
      originalPrice: ils(184_96),
    });
    expect(sony?.price).toMatchObject({ shipping: ils(55_50), importVat: ils(62_60), total: ils(410_40) });
    expect(keyboard?.delivery.isFreeShipping).toBe(true);
    expect(a40?.price.shippingKnown).toBe(false);
    expect(
      result.value.products.every(
        (p) => p.productUrl.startsWith("https://www.ebay.com/itm/") && !p.productUrl.includes("?"),
      ),
    ).toBe(true);
  });

  it("returns an empty list when itemSummaries is absent", async () => {
    expect(await setup(async () => json(searchEmpty)).search()).toEqual({
      ok: true,
      value: { products: [], hasMore: false },
    });
  });

  it("does not treat legitimately skipped items as a contract change", async () => {
    const auctionsOnly = {
      itemSummaries: [
        {
          itemId: "v1|1|0",
          title: "x",
          price: { value: "1.00", currency: "USD" },
          buyingOptions: ["AUCTION"],
        },
      ],
    };
    expect(await setup(async () => json(auctionsOnly)).search()).toEqual({
      ok: true,
      value: { products: [], hasMore: false },
    });
  });
});

describe("eBay adapter — tokens", () => {
  it("refreshes the token once on 401 and retries", async () => {
    const responses = [json(errorInvalidToken, 401), json(searchEmpty)];
    const { tokens, fetchMock, search } = setup(async () => responses.shift() ?? json(searchEmpty));
    expect(await search()).toEqual({ ok: true, value: { products: [], hasMore: false } });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    const authHeaders = fetchMock.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>).Authorization,
    );
    expect(authHeaders).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  it("gives up with unauthorized when the fresh token is rejected too", async () => {
    expect(await setup(async () => json(errorInvalidToken, 401)).search()).toEqual({
      ok: false,
      error: {
        provider: "ebay",
        kind: "unauthorized",
        code: "EBAY_1001",
        retryable: false,
        detail: "Invalid access token",
      },
    });
  });

  it("surfaces token failures without calling search", async () => {
    const { tokens, fetchMock, search } = setup(async () => json(searchEmpty));
    tokens.getToken.mockResolvedValueOnce(err({ kind: "unauthorized", code: "OAUTH_HTTP_401" }));
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "unauthorized", code: "OAUTH_HTTP_401", retryable: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed refresh after a 401", async () => {
    const { tokens, search } = setup(async () => json(errorInvalidToken, 401));
    tokens.getToken
      .mockResolvedValueOnce(ok("token-1"))
      .mockResolvedValueOnce(err({ kind: "upstream_error", code: "OAUTH_HTTP_503" }));
    expect(await search()).toMatchObject({ ok: false, error: { code: "OAUTH_HTTP_503", retryable: true } });
  });
});

describe("eBay adapter — failures never throw", () => {
  it("treats a bad request (our bug) as non-retryable", async () => {
    expect(await setup(async () => json(errorInvalidFilter, 400)).search()).toEqual({
      ok: false,
      error: {
        provider: "ebay",
        kind: "upstream_error",
        code: "EBAY_12001",
        retryable: false,
        detail: "The 'filter' value is invalid.",
      },
    });
  });

  it.each([
    [403, "unauthorized", false],
    [429, "rate_limited", true],
    [500, "upstream_error", true],
  ] as const)("maps HTTP %i to %s", async (status, kind, retryable) => {
    expect(await setup(async () => json({}, status)).search()).toMatchObject({
      ok: false,
      error: { kind, retryable, code: `HTTP_${status}` },
    });
  });

  it("returns parse errors for non-JSON, wrong shapes, and all-invalid items", async () => {
    expect(await setup(async () => new Response("<html>")).search()).toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });
    expect(await setup(async () => json({ itemSummaries: "nope" })).search()).toMatchObject({
      ok: false,
      error: { code: "PARSE_ERROR" },
    });
    expect(await setup(async () => json({ itemSummaries: [{ foo: 1 }] })).search()).toMatchObject({
      ok: false,
      error: { code: "ALL_ITEMS_INVALID", retryable: false },
    });
  });

  it("maps network failures and timeouts", async () => {
    expect(await setup(() => Promise.reject(new TypeError("fetch failed"))).search()).toMatchObject({
      ok: false,
      error: { code: "NETWORK", detail: "fetch failed", retryable: true },
    });
    expect(await setup(() => Promise.reject("down")).search()).toMatchObject({
      ok: false,
      error: { detail: "down" },
    });
    const hanging = setup(
      (_url, init) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
      { timeoutMs: 5 },
    );
    expect(await hanging.search()).toMatchObject({ ok: false, error: { kind: "timeout", code: "TIMEOUT" } });
  });

  it("fails without blaming eBay when exchange rates are unavailable", async () => {
    expect(
      await setup(async () => json(searchOk), {
        getFxRates: () => Promise.reject(new Error("rates down")),
      }).search(),
    ).toMatchObject({
      ok: false,
      error: { code: "FX_UNAVAILABLE", retryable: false, detail: "rates down" },
    });
    expect(
      await setup(async () => json(searchOk), { getFxRates: () => Promise.reject("down") }).search(),
    ).toMatchObject({
      ok: false,
      error: { detail: "down" },
    });
  });

  it("omits the affiliate campaign when none is configured", async () => {
    const { fetchMock, search } = setup(async () => json(searchEmpty), { affiliateCampaignId: undefined });
    await search();
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)["X-EBAY-C-ENDUSERCTX"]).toBe(
      "contextualLocation=country%3DIL",
    );
  });

  it("identifies as the ebay provider", () => {
    expect(setup(async () => json(searchEmpty)).provider.id).toBe("ebay");
  });
});
