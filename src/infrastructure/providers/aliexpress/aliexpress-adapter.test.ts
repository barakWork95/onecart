import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { money } from "@/domain/shared/money";
import {
  createAliExpressProvider,
  type AliExpressProviderConfig,
} from "@/infrastructure/providers/aliexpress/aliexpress-adapter";
import { signAliExpressParams } from "@/infrastructure/providers/aliexpress/aliexpress-signer";
import { TEST_FX } from "@/test/fx";
import errorRateLimit from "./fixtures/error-rate-limit.json";
import errorSignature from "./fixtures/error-signature.json";
import searchEmpty from "./fixtures/search-empty.json";
import searchMalformed from "./fixtures/search-malformed.json";
import searchOk from "./fixtures/search-ok.json";
import searchRecorded from "./fixtures/search-recorded.json";

const QUERY: SearchQuery = {
  rawText: "אוזניות אלחוטיות",
  detectedLanguage: "he",
  normalizedText: "wireless earbuds",
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 2,
  pageSize: 20,
};

const NOW = new Date("2026-10-11T09:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(
  respond: (url: URL, init?: RequestInit) => Promise<Response>,
  overrides: Partial<AliExpressProviderConfig> = {},
) {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    respond(new URL(String(input)), init),
  );
  const provider = createAliExpressProvider({
    appKey: "12345",
    appSecret: "s3cr3t",
    trackingId: "onecart",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: fetchMock,
    now: () => NOW,
    ...overrides,
  });
  const search = () => provider.search(QUERY, { signal: new AbortController().signal });
  return { provider, fetchMock, search };
}

describe("AliExpress adapter — request", () => {
  it("sends a correctly signed product query for Israel in ILS", async () => {
    const { fetchMock, provider } = setup(async () => jsonResponse(searchEmpty));
    await provider.search(QUERY, { signal: new AbortController().signal, storePage: 2 });

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    const params = Object.fromEntries(url.searchParams);
    const { sign, ...signed } = params;

    expect(`${url.origin}${url.pathname}`).toBe("https://api-sg.aliexpress.com/sync");
    expect(init?.method).toBe("POST");
    expect(params).toMatchObject({
      method: "aliexpress.affiliate.product.query",
      app_key: "12345",
      sign_method: "md5",
      timestamp: String(NOW.getTime()),
      v: "2.0",
      format: "json",
      keywords: "wireless earbuds",
      ship_to_country: "IL",
      target_currency: "ILS",
      target_language: "EN",
      page_no: "2",
      page_size: "20",
      tracking_id: "onecart",
    });
    expect(sign).toBe(signAliExpressParams(signed, "s3cr3t"));
  });

  it("omits tracking_id when none is configured", async () => {
    const { fetchMock, search } = setup(async () => jsonResponse(searchEmpty), { trackingId: undefined });
    await search();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.has("tracking_id")).toBe(false);
  });

  it("never leaks the app secret into the request", async () => {
    const { fetchMock, search } = setup(async () => jsonResponse(searchEmpty));
    await search();
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("s3cr3t");
  });
});

describe("AliExpress adapter — successful responses", () => {
  it("maps valid products and drops malformed or unsupported ones", async () => {
    const { search } = setup(async () => jsonResponse(searchOk));
    const result = await search();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products.map((p) => p.id)).toEqual([
      "aliexpress:1005006271234567",
      "aliexpress:1005007000000001",
      "aliexpress:1005005123456789",
    ]);
    const [earbuds, keyboard, mount] = result.value.products;
    expect(earbuds?.price.total).toEqual(money(89_00, "ILS"));
    expect(earbuds?.productUrl).toBe("https://www.aliexpress.com/item/1005006271234567.html");
    expect(keyboard?.price).toMatchObject({ importVat: money(59_38, "ILS"), total: money(389_28, "ILS") });
    expect(keyboard?.originalPrice).toBeNull();
    expect(mount?.price.listed).toEqual(money(12_50, "USD"));
    expect(result.value.products.every((p) => p.fetchedAt === NOW.toISOString())).toBe(true);
  });

  it("reports more pages while page_no × page_size is below the total", async () => {
    const { provider } = setup(async () => jsonResponse(searchOk));
    const signal = new AbortController().signal;
    const first = await provider.search(QUERY, { signal });
    expect(first.ok && first.value.hasMore).toBe(true);
    // 1840 results at 20 a page: page 92 is the last.
    const last = await provider.search(QUERY, { signal, storePage: 92 });
    expect(last.ok && last.value.hasMore).toBe(false);
  });

  it("never stores the affiliate promotion_link", async () => {
    const { search } = setup(async () => jsonResponse(searchOk));
    const result = await search();
    expect(JSON.stringify(result)).not.toContain("s.click.aliexpress.com");
  });

  it("returns an empty list for a legitimate zero-result search", async () => {
    const { search } = setup(async () => jsonResponse(searchEmpty));
    expect(await search()).toEqual({ ok: true, value: { products: [], hasMore: false } });
  });

  it("passes pricesIncludeImportVat through to the mapper", async () => {
    const { search } = setup(async () => jsonResponse(searchOk), { pricesIncludeImportVat: true });
    const result = await search();
    expect(result.ok && result.value.products[1]?.price.taxesCollectedAtCheckout).toBe(true);
  });
});

describe("AliExpress adapter — failures never throw", () => {
  it.each([
    [401, "unauthorized", false],
    [403, "unauthorized", false],
    [429, "rate_limited", true],
    [500, "upstream_error", true],
    [503, "upstream_error", true],
  ] as const)("maps HTTP %i to %s (retryable=%p)", async (status, kind, retryable) => {
    const { search } = setup(async () => jsonResponse({}, status));
    expect(await search()).toEqual({
      ok: false,
      error: { provider: "aliexpress", kind, code: `HTTP_${status}`, retryable },
    });
  });

  it("maps a signature error to unauthorized (not retryable, a config bug)", async () => {
    const { search } = setup(async () => jsonResponse(errorSignature));
    const result = await search();
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unauthorized", code: "GATEWAY_IncompleteSignature", retryable: false },
    });
  });

  it("maps the gateway call limit to rate_limited", async () => {
    const { search } = setup(async () => jsonResponse(errorRateLimit));
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "rate_limited", code: "GATEWAY_ApiCallLimit" },
    });
  });

  it("maps unknown gateway codes to upstream_error", async () => {
    const { search } = setup(async () =>
      jsonResponse({ error_response: { code: 15, msg: "Remote service error" } }),
    );
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "upstream_error", code: "GATEWAY_15" },
    });
  });

  it("maps a non-200 resp_code to upstream_error", async () => {
    const body = {
      aliexpress_affiliate_product_query_response: {
        resp_result: { resp_code: 402, resp_msg: "Invalid input" },
      },
    };
    const { search } = setup(async () => jsonResponse(body));
    expect(await search()).toMatchObject({ ok: false, error: { kind: "upstream_error", code: "RESP_402" } });
  });

  it("returns parse_error when the envelope doesn't match the schema", async () => {
    const { search } = setup(async () => jsonResponse(searchMalformed));
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "parse_error", code: "PARSE_ERROR", retryable: false },
    });
  });

  it("returns parse_error when every item is invalid (contract change, not 'no results')", async () => {
    const body = {
      aliexpress_affiliate_product_query_response: {
        resp_result: {
          resp_code: 200,
          result: { products: { product: [{ product_id: 1 }, { foo: "bar" }] } },
        },
      },
    };
    const { search } = setup(async () => jsonResponse(body));
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "parse_error", code: "ALL_ITEMS_INVALID" },
    });
  });

  it("returns parse_error for a non-JSON body", async () => {
    const { search } = setup(async () => new Response("<html>gateway</html>", { status: 200 }));
    expect(await search()).toMatchObject({ ok: false, error: { kind: "parse_error", code: "INVALID_JSON" } });
  });

  it("maps network failures to a retryable upstream_error", async () => {
    const { search } = setup(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await search()).toMatchObject({
      ok: false,
      error: { kind: "upstream_error", code: "NETWORK", retryable: true, detail: "fetch failed" },
    });
  });

  it("handles non-Error throwables", async () => {
    const { search } = setup(() => Promise.reject("socket hang up"));
    expect(await search()).toMatchObject({ ok: false, error: { code: "NETWORK", detail: "socket hang up" } });
  });

  it("returns timeout when the call exceeds its own deadline", async () => {
    const { search } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      { timeoutMs: 5 },
    );
    expect(await search()).toEqual({
      ok: false,
      error: { provider: "aliexpress", kind: "timeout", code: "TIMEOUT", retryable: true },
    });
  });

  it("returns timeout when the caller aborts", async () => {
    const { provider } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const controller = new AbortController();
    const pending = provider.search(QUERY, { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { kind: "timeout" } });
  });
});

describe("AliExpress adapter — FX outage", () => {
  it("fails without blaming AliExpress when exchange rates are unavailable", async () => {
    const { search } = setup(async () => jsonResponse(searchOk), {
      getFxRates: () => Promise.reject(new Error("rates down")),
    });
    expect(await search()).toEqual({
      ok: false,
      error: {
        provider: "aliexpress",
        kind: "upstream_error",
        code: "FX_UNAVAILABLE",
        retryable: false,
        detail: "rates down",
      },
    });
  });

  it("handles a non-Error rejection from the FX source", async () => {
    const { search } = setup(async () => jsonResponse(searchOk), {
      getFxRates: () => Promise.reject("down"),
    });
    expect(await search()).toMatchObject({ ok: false, error: { code: "FX_UNAVAILABLE", detail: "down" } });
  });
});

describe("AliExpress adapter — identity", () => {
  it("identifies as the aliexpress provider", () => {
    expect(setup(async () => jsonResponse(searchEmpty)).provider.id).toBe("aliexpress");
  });
});

describe("AliExpress adapter — recorded live response (2026-10-14)", () => {
  it("maps every item of a real product.query page", async () => {
    const result = await setup(async () => jsonResponse(searchRecorded)).search();
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
    const { products, hasMore } = result.value;
    expect(products).toHaveLength(7);
    expect(hasMore).toBe(true);

    const flip = products.find((p) => p.providerProductId === "1005013304541989");
    expect(flip).toMatchObject({
      id: "aliexpress:1005013304541989",
      // Tracking params (pdp_npi…) are stripped from the canonical URL.
      productUrl: "https://www.aliexpress.com/item/1005013304541989.html",
      sellerName: "JBL Pro Sound Store",
      rating: null,
    });
    expect(flip?.price.item).toEqual({ amountMinor: 149_00, currency: "ILS" });
    // The product query quotes no shipping: the card must say "+ shipping".
    expect(flip?.price.shippingKnown).toBe(false);
    // Live photos come from aliexpress-media.com, not only alicdn.com.
    expect(flip?.imageUrl).toMatch(/^https:\/\/ae-pic-a1\.aliexpress-media\.com\//);
  });
});
