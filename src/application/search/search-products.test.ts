import { createSearchProducts, type SearchProductsDeps } from "@/application/search/search-products";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type {
  ProductSearchProvider,
  ProviderError,
  ProviderPage,
  ProviderSearchOptions,
} from "@/domain/search/product-search-provider";
import type { CircuitBreakerStore, SearchResultCache } from "@/domain/search/ports";
import { searchCacheKey, type SearchQuery } from "@/domain/search/search-query";
import { money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { err, ok, type Result } from "@/domain/shared/result";
import { fakeCircuitBreakerStore, fakeSearchCache } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

type CallResult = Result<ProviderPage, ProviderError>;
type Behavior = (
  query: SearchQuery,
  signal: AbortSignal,
  storePage: number,
) => Promise<CallResult> | CallResult;

const QUERY: SearchQuery = {
  rawText: "wireless earbuds",
  detectedLanguage: "en",
  normalizedText: "wireless earbuds",
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
};

const EARBUDS = {
  aliexpress: makeProduct({
    provider: "aliexpress",
    sku: "a1",
    title: "Soundcore Life P3 Earbuds",
    total: 89_00,
  }),
  amazon: makeProduct({
    provider: "amazon",
    sku: "z1",
    title: "Anker Soundcore Life P3 Earbuds",
    total: 142_00,
  }),
  temu: makeProduct({
    provider: "temu",
    sku: "t1",
    title: "Soundcore Life P3 Wireless Earbuds",
    total: 98_00,
  }),
};
const HEADPHONES = makeProduct({
  provider: "amazon",
  sku: "z2",
  title: "Sony WH-CH720N Headphones",
  total: 310_00,
});

function fakeProvider(id: ProviderId, behavior: Behavior) {
  const search = jest.fn((query: SearchQuery, options: ProviderSearchOptions) =>
    Promise.resolve(behavior(query, options.signal, options.storePage ?? 1)),
  );
  const provider: ProductSearchProvider = { id, search };
  return { provider, search };
}

const okPage = (products: readonly UnifiedProduct[], hasMore = false): CallResult =>
  ok({ products, hasMore });

const failure = (provider: ProviderId, kind: ProviderError["kind"], retryable = true): CallResult =>
  err({ provider, kind, code: `TEST_${kind.toUpperCase()}`, retryable });

const never = (): Promise<CallResult> => new Promise<CallResult>(() => undefined);

function setup(providers: ProductSearchProvider[], overrides: Partial<SearchProductsDeps> = {}) {
  const clock = { ms: 1_760_000_000_000 };
  const cache = fakeSearchCache(() => clock.ms);
  const circuitBreaker = fakeCircuitBreakerStore();
  const logger = { warn: jest.fn() };
  const search = createSearchProducts({
    providers,
    cache,
    circuitBreaker,
    circuitBreakerPolicy: { failureThreshold: 2, cooldownMs: 30_000 },
    providerTimeoutMs: 50,
    now: () => clock.ms,
    logger,
    ...overrides,
  });
  return { search, cache, circuitBreaker, clock, logger };
}

const outcome = (response: Awaited<ReturnType<ReturnType<typeof createSearchProducts>>>, id: ProviderId) =>
  response.providers.find((p) => p.provider === id);

describe("searchProducts — fan-out and grouping", () => {
  it("queries providers concurrently and groups the same product across stores", async () => {
    // Amazon only answers once Temu has been called: a sequential loop would time out.
    let temuCalled!: () => void;
    const temuStarted = new Promise<void>((resolve) => (temuCalled = resolve));
    const amazon = fakeProvider("amazon", async () => {
      await temuStarted;
      return okPage([EARBUDS.amazon, HEADPHONES]);
    });
    const temu = fakeProvider("temu", () => {
      temuCalled();
      return okPage([EARBUDS.temu]);
    });
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));

    const response = await setup([amazon.provider, temu.provider, ali.provider]).search(QUERY);

    expect(response.isPartial).toBe(false);
    expect(response.providers.map((p) => [p.provider, p.status, p.resultCount])).toEqual([
      ["amazon", "ok", 2],
      ["temu", "ok", 1],
      ["aliexpress", "ok", 1],
    ]);
    expect(response.groups.map((g) => g.offers.map((o) => o.id))).toEqual([
      ["aliexpress:a1", "temu:t1", "amazon:z1"],
      ["amazon:z2"],
    ]);
    expect(response.totalOffers).toBe(4);
    expect(response.pagination).toEqual({ page: 1, pageSize: 20, totalResults: 2, hasNextPage: false });
  });

  it("by default keeps each store's own best-match order, interleaved across stores", async () => {
    // Amazon ranks headphones first; AliExpress ranks earbuds first. Both #1s beat any #2.
    const amazon = fakeProvider("amazon", () => okPage([HEADPHONES, EARBUDS.amazon]));
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const response = await setup([amazon.provider, ali.provider]).search({ ...QUERY, sort: "relevance" });
    // Earbuds group: best rank 0 (AliExpress) and 2 stores → ahead of headphones (rank 0, 1 store).
    expect(response.groups.map((g) => g.id)).toEqual(["grp:aliexpress:a1", "grp:amazon:z2"]);
  });

  it("never filters store results by the query text — the store's own search decides relevance", async () => {
    // A store may return products whose titles don't repeat the query words (synonyms, related items).
    const related = makeProduct({
      provider: "amazon",
      sku: "r1",
      title: "Sony WH-1000XM5 Over-Ear",
      total: 900_00,
    });
    const amazon = fakeProvider("amazon", () => okPage([related]));
    const response = await setup([amazon.provider]).search({
      ...QUERY,
      normalizedText: "wireless headphones",
    });
    expect(response.groups.map((g) => g.id)).toEqual(["grp:amazon:r1"]);
  });

  it("always asks providers for page 1 and paginates locally", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress, HEADPHONES]));
    const response = await setup([ali.provider]).search({ ...QUERY, page: 2, pageSize: 1 });

    expect(ali.search.mock.calls[0]?.[0].page).toBe(1);
    expect(response.groups.map((g) => g.id)).toEqual(["grp:amazon:z2"]);
    expect(response.pagination).toEqual({ page: 2, pageSize: 1, totalResults: 2, hasNextPage: false });
  });

  it("measures per-provider latency with the injected clock", async () => {
    const holder: { clock?: { ms: number } } = {};
    const slow = fakeProvider("ebay", () => {
      if (holder.clock) holder.clock.ms += 120;
      return okPage([]);
    });
    const ctx = setup([slow.provider]);
    holder.clock = ctx.clock;
    expect(outcome(await ctx.search(QUERY), "ebay")?.latencyMs).toBe(120);
  });

  it("returns an empty, non-partial response when no providers are enabled", async () => {
    const response = await setup([]).search(QUERY);
    expect(response).toMatchObject({ groups: [], providers: [], isPartial: false, totalOffers: 0 });
  });
});

describe("searchProducts — resilience and partial results", () => {
  it("returns other stores' results when one store errors", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const response = await setup([ali.provider, ebay.provider]).search(QUERY);

    expect(response.isPartial).toBe(true);
    expect(response.groups).toHaveLength(1);
    expect(outcome(response, "ebay")).toMatchObject({
      status: "error",
      resultCount: 0,
      errorCode: "TEST_UPSTREAM_ERROR",
      fromCache: false,
    });
  });

  it("enforces the deadline even when an adapter ignores its abort signal", async () => {
    let receivedSignal: AbortSignal | undefined;
    const stuck = fakeProvider("temu", (_q, signal) => {
      receivedSignal = signal;
      return never();
    });
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const response = await setup([stuck.provider, ali.provider]).search(QUERY);

    expect(outcome(response, "temu")).toMatchObject({ status: "timeout", errorCode: "TIMEOUT" });
    expect(receivedSignal?.aborted).toBe(true);
    expect(response).toMatchObject({ isPartial: true, totalOffers: 1 });
  });

  it("gives a store its own deadline when it declares one", async () => {
    // Search-wide deadline is 50ms; this store answers after 120ms but allows itself 500ms.
    const slow: ProductSearchProvider = {
      id: "amazon",
      timeoutMs: 500,
      search: () => new Promise((resolve) => setTimeout(() => resolve(okPage([EARBUDS.amazon])), 120)),
    };
    const response = await setup([slow]).search(QUERY);
    expect(outcome(response, "amazon")?.status).toBe("ok");
  });

  it("reports an adapter-reported timeout as a timeout", async () => {
    const slow = fakeProvider("amazon", () => failure("amazon", "timeout"));
    expect(outcome(await setup([slow.provider]).search(QUERY), "amazon")?.status).toBe("timeout");
  });

  it.each<[string, ProductSearchProvider["search"]]>([
    [
      "synchronously",
      () => {
        throw new Error("boom");
      },
    ],
    ["asynchronously", () => Promise.reject(new Error("boom"))],
    ["with a non-Error value", () => Promise.reject("boom")],
  ])("contains an adapter that throws %s", async (_label, search) => {
    const bad: ProductSearchProvider = { id: "ebay", search };
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const response = await setup([bad, ali.provider]).search(QUERY);
    expect(outcome(response, "ebay")).toMatchObject({ status: "error", errorCode: "ADAPTER_THREW" });
    expect(outcome(response, "aliexpress")?.status).toBe("ok");
  });

  it("returns no groups but per-store statuses when every store fails", async () => {
    const a = fakeProvider("amazon", () => failure("amazon", "rate_limited"));
    const b = fakeProvider("temu", () => failure("temu", "upstream_error"));
    const response = await setup([a.provider, b.provider]).search(QUERY);
    expect(response).toMatchObject({ groups: [], isPartial: true });
    expect(response.providers.map((p) => p.status)).toEqual(["error", "error"]);
  });

  it("skips providers excluded by the query without marking the response partial", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const amazon = fakeProvider("amazon", () => okPage([EARBUDS.amazon]));
    const response = await setup([ali.provider, amazon.provider]).search({
      ...QUERY,
      providers: ["aliexpress"],
    });

    expect(amazon.search).not.toHaveBeenCalled();
    expect(outcome(response, "amazon")).toEqual({
      provider: "amazon",
      status: "skipped",
      resultCount: 0,
      latencyMs: null,
      fromCache: false,
    });
    expect(response.isPartial).toBe(false);
  });

  it("treats an empty providers filter as 'all providers'", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    await setup([ali.provider]).search({ ...QUERY, providers: [] });
    expect(ali.search).toHaveBeenCalled();
  });

  it("stops waiting when the caller aborts, without blaming the provider", async () => {
    const stuck = fakeProvider("temu", () => never());
    const ctx = setup([stuck.provider], { providerTimeoutMs: 10_000 });
    const controller = new AbortController();
    const pending = ctx.search(QUERY, { signal: controller.signal });
    controller.abort();

    expect(outcome(await pending, "temu")?.status).toBe("timeout");
    expect(await ctx.circuitBreaker.get("temu")).toBeNull();
  });

  it("handles a signal that was already aborted", async () => {
    const stuck = fakeProvider("temu", () => never());
    const controller = new AbortController();
    controller.abort();
    const response = await setup([stuck.provider], { providerTimeoutMs: 10_000 }).search(QUERY, {
      signal: controller.signal,
    });
    expect(outcome(response, "temu")?.status).toBe("timeout");
  });
});

describe("searchProducts — caching", () => {
  it("serves repeat searches from cache, regardless of sort, filters, or page", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress, HEADPHONES]));
    const { search } = setup([ali.provider]);

    await search(QUERY);
    const second = await search({
      ...QUERY,
      sort: "rating_desc",
      page: 2,
      pageSize: 1,
      filters: { maxTotal: money(500_00, "ILS") },
    });

    expect(ali.search).toHaveBeenCalledTimes(1);
    expect(outcome(second, "aliexpress")).toMatchObject({
      status: "ok",
      fromCache: true,
      latencyMs: null,
      resultCount: 2,
    });
    expect(second.pagination).toMatchObject({ page: 2, totalResults: 2 });
  });

  it("shares cache entries across differently-cased query text", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const { search } = setup([ali.provider]);
    await search(QUERY);
    await search({ ...QUERY, normalizedText: "  Wireless EARBUDS " });
    expect(ali.search).toHaveBeenCalledTimes(1);
  });

  it("writes results under the provider/country/query key with a 24h TTL by default", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const ctx = setup([ali.provider], { cacheTtlSeconds: undefined });
    const set = jest.spyOn(ctx.cache, "set");
    await ctx.search(QUERY);
    expect(set).toHaveBeenCalledWith(
      searchCacheKey(QUERY, "aliexpress"),
      {
        products: [EARBUDS.aliexpress],
        hasMore: false,
        unavailable: [],
        cachedAt: new Date(ctx.clock.ms).toISOString(),
      },
      86_400,
    );
  });

  it("expires entries after the TTL", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const ctx = setup([ali.provider], { cacheTtlSeconds: 60 });
    await ctx.search(QUERY);
    ctx.clock.ms += 61_000;
    await ctx.search(QUERY);
    expect(ali.search).toHaveBeenCalledTimes(2);
  });

  it("caches a legitimate empty result", async () => {
    const ebay = fakeProvider("ebay", () => okPage([]));
    const { search } = setup([ebay.provider]);
    expect(outcome(await search(QUERY), "ebay")?.status).toBe("empty");
    expect(outcome(await search(QUERY), "ebay")).toMatchObject({ status: "empty", fromCache: true });
    expect(ebay.search).toHaveBeenCalledTimes(1);
  });

  it("never caches failures", async () => {
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const { search } = setup([ebay.provider]);
    await search(QUERY);
    await search(QUERY);
    expect(ebay.search).toHaveBeenCalledTimes(2);
  });

  it("keeps searching when the cache is down", async () => {
    const brokenCache: SearchResultCache = {
      get: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
    };
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const { search, logger } = setup([ali.provider], { cache: brokenCache });

    const response = await search(QUERY);
    expect(outcome(response, "aliexpress")?.status).toBe("ok");
    expect(logger.warn).toHaveBeenCalledWith(
      "search: cache read failed, continuing without it",
      expect.objectContaining({ provider: "aliexpress", error: "redis down" }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "search: cache write failed, continuing without it",
      expect.anything(),
    );
  });

  it("logs non-Error cache failures too", async () => {
    const brokenCache: SearchResultCache = { get: () => Promise.reject("nope"), set: async () => undefined };
    const ali = fakeProvider("aliexpress", () => okPage([]));
    const { search, logger } = setup([ali.provider], { cache: brokenCache });
    await search(QUERY);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: "nope" }));
  });
});

describe("searchProducts — circuit breaker", () => {
  it("opens after consecutive retryable failures and stops calling the store", async () => {
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const { search } = setup([ebay.provider]);

    await search(QUERY);
    await search(QUERY);
    const third = await search(QUERY);

    expect(ebay.search).toHaveBeenCalledTimes(2);
    expect(outcome(third, "ebay")).toMatchObject({ status: "circuit_open", latencyMs: null });
    expect(third.isPartial).toBe(true);
  });

  it("counts timeouts as failures", async () => {
    const stuck = fakeProvider("temu", () => never());
    const { search, circuitBreaker } = setup([stuck.provider]);
    await search(QUERY);
    expect(await circuitBreaker.get("temu")).toEqual({ status: "closed", consecutiveFailures: 1 });
  });

  it("probes after the cooldown and closes again on success", async () => {
    let healthy = false;
    const ebay = fakeProvider("ebay", () =>
      healthy ? okPage([EARBUDS.amazon]) : failure("ebay", "upstream_error"),
    );
    const { search, clock, circuitBreaker } = setup([ebay.provider]);

    await search(QUERY);
    await search(QUERY); // opens
    clock.ms += 30_000;
    healthy = true;

    expect(outcome(await search(QUERY), "ebay")?.status).toBe("ok");
    expect(await circuitBreaker.get("ebay")).toEqual({ status: "closed", consecutiveFailures: 0 });
  });

  it("re-opens immediately when the probe fails", async () => {
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const { search, clock } = setup([ebay.provider]);

    await search(QUERY);
    await search(QUERY); // opens
    clock.ms += 30_000;
    await search(QUERY); // probe fails → open again
    clock.ms += 1_000;

    expect(outcome(await search(QUERY), "ebay")?.status).toBe("circuit_open");
    expect(ebay.search).toHaveBeenCalledTimes(3);
  });

  it("resets the failure count after a success", async () => {
    let fail = true;
    const ebay = fakeProvider("ebay", () => (fail ? failure("ebay", "upstream_error") : okPage([])));
    const { search, circuitBreaker } = setup([ebay.provider], { cacheTtlSeconds: 0 });

    await search(QUERY);
    fail = false;
    await search(QUERY);
    expect(await circuitBreaker.get("ebay")).toEqual({ status: "closed", consecutiveFailures: 0 });
  });

  it("skips the breaker write when the circuit is already clean", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([]));
    const store = fakeCircuitBreakerStore();
    await store.set("aliexpress", { status: "closed", consecutiveFailures: 0 });
    const set = jest.spyOn(store, "set");
    await setup([ali.provider], { circuitBreaker: store }).search(QUERY);
    expect(set).not.toHaveBeenCalled();
  });

  it("ignores non-retryable errors (config bugs aren't outages)", async () => {
    const amazon = fakeProvider("amazon", () => failure("amazon", "unauthorized", false));
    const { search, circuitBreaker } = setup([amazon.provider]);
    await search(QUERY);
    await search(QUERY);
    await search(QUERY);
    expect(amazon.search).toHaveBeenCalledTimes(3);
    expect(await circuitBreaker.get("amazon")).toBeNull();
  });

  it("fails open when the breaker store is unavailable", async () => {
    const brokenStore: CircuitBreakerStore = {
      get: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
    };
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const { search, logger } = setup([ebay.provider, ali.provider], { circuitBreaker: brokenStore });

    const response = await search(QUERY);
    expect(ebay.search).toHaveBeenCalled();
    expect(outcome(response, "aliexpress")?.status).toBe("ok");
    expect(logger.warn).toHaveBeenCalledWith(
      "search: circuit read failed, continuing without it",
      expect.anything(),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "search: circuit write failed, continuing without it",
      expect.anything(),
    );
  });
});

describe("searchProducts — filtering and sorting after merge", () => {
  it("applies filters per offer before grouping", async () => {
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const amazon = fakeProvider("amazon", () => okPage([EARBUDS.amazon, HEADPHONES]));
    const response = await setup([ali.provider, amazon.provider]).search({
      ...QUERY,
      filters: { maxTotal: money(100_00, "ILS") },
    });
    expect(response.groups.map((g) => g.offers.map((o) => o.id))).toEqual([["aliexpress:a1"]]);
    expect(response.totalOffers).toBe(1);
  });

  it("sorts groups per the query", async () => {
    const amazon = fakeProvider("amazon", () =>
      okPage([
        makeProduct({
          provider: "amazon",
          sku: "slow",
          title: "Alpha A1",
          total: 50_00,
          deliveryDays: [10, 20],
        }),
        makeProduct({
          provider: "amazon",
          sku: "fast",
          title: "Beta B2",
          total: 90_00,
          deliveryDays: [1, 2],
        }),
      ]),
    );
    const response = await setup([amazon.provider]).search({ ...QUERY, sort: "delivery_fastest" });
    expect(response.groups.map((g) => g.offers[0].providerProductId)).toEqual(["fast", "slow"]);
  });

  it("stamps the response with the query and generation time", async () => {
    const ctx = setup([]);
    const response = await ctx.search(QUERY);
    expect(response.query).toBe(QUERY);
    expect(response.generatedAt).toBe(new Date(ctx.clock.ms).toISOString());
  });

  it("works with default policy, timeout, clock, and logger", async () => {
    const ebay = fakeProvider("ebay", () => failure("ebay", "upstream_error"));
    const ali = fakeProvider("aliexpress", () => okPage([EARBUDS.aliexpress]));
    const search = createSearchProducts({
      providers: [ebay.provider, ali.provider],
      cache: fakeSearchCache(Date.now),
      circuitBreaker: fakeCircuitBreakerStore(),
    });
    const response = await search(QUERY);
    expect(response).toMatchObject({ isPartial: true, totalOffers: 1 });
    expect(Date.parse(response.generatedAt)).not.toBeNaN();
  });
});

describe("searchProducts — paging through store results", () => {
  /** `count` distinct, ungroupable products for one store page. */
  const items = (provider: ProviderId, storePage: number, count: number) =>
    Array.from({ length: count }, (_, i) =>
      makeProduct({
        provider,
        sku: `${provider}-p${storePage}-${i}`,
        title: `Gadget ${provider.slice(0, 2).toUpperCase()}${storePage}${String(i).padStart(2, "0")}X`,
        total: 100_00 + i,
      }),
    );

  /** A store with `pages` pages of `perPage` items each. */
  function pagedStore(id: ProviderId, pages: number, perPage: number) {
    return fakeProvider(id, (_query, _signal, storePage) =>
      storePage <= pages ? okPage(items(id, storePage, perPage), storePage < pages) : okPage([]),
    );
  }

  const storePagesAsked = (store: ReturnType<typeof fakeProvider>) =>
    store.search.mock.calls.map(([, options]) => options.storePage ?? 1);

  const PAGE = { ...QUERY, sort: "relevance" as const, pageSize: 4 };

  it("never asks a store for a deeper page on results page 1, but says more exist", async () => {
    const ebay = pagedStore("ebay", 3, 2);
    const response = await setup([ebay.provider]).search(PAGE);
    expect(storePagesAsked(ebay)).toEqual([1]);
    expect(response.groups).toHaveLength(2);
    expect(response.pagination).toMatchObject({ page: 1, totalResults: 2, hasNextPage: true });
  });

  it("serves later results pages from already-loaded results at no extra store call", async () => {
    const ebay = pagedStore("ebay", 3, 10);
    const response = await setup([ebay.provider]).search({ ...PAGE, page: 2 });
    expect(storePagesAsked(ebay)).toEqual([1]);
    expect(response.groups.map((g) => g.offers[0].providerProductId)).toEqual([
      "ebay-p1-4",
      "ebay-p1-5",
      "ebay-p1-6",
      "ebay-p1-7",
    ]);
    expect(response.pagination.hasNextPage).toBe(true);
  });

  it("fetches the next store page only when loaded results run out, only from stores with more", async () => {
    const ebay = pagedStore("ebay", 3, 3);
    const amazon = pagedStore("amazon", 1, 2);
    const response = await setup([ebay.provider, amazon.provider]).search({ ...PAGE, page: 2 });
    // 5 groups loaded; page 2 needs 8 (+1 to know about page 3): eBay pages 2 and 3 are fetched.
    expect(storePagesAsked(ebay)).toEqual([1, 2, 3]);
    expect(storePagesAsked(amazon)).toEqual([1]);
    expect(response.groups).toHaveLength(4);
    expect(response.pagination).toMatchObject({ totalResults: 11, hasNextPage: true });
    expect(outcome(response, "ebay")).toMatchObject({ status: "ok", resultCount: 9, fromCache: false });
  });

  it("ranks deeper store pages after the earlier ones in best-match order", async () => {
    const ebay = pagedStore("ebay", 2, 3);
    const response = await setup([ebay.provider]).search({ ...PAGE, page: 2, pageSize: 3 });
    expect(response.groups.map((g) => g.offers[0].providerProductId)).toEqual([
      "ebay-p2-0",
      "ebay-p2-1",
      "ebay-p2-2",
    ]);
    expect(response.pagination.hasNextPage).toBe(false);
  });

  it("caches every store page, so paging back and forth never re-fetches", async () => {
    const ebay = pagedStore("ebay", 3, 3);
    const { search } = setup([ebay.provider]);
    await search({ ...PAGE, page: 2 });
    const again = await search({ ...PAGE, page: 2 });
    await search({ ...PAGE, page: 1 });
    expect(storePagesAsked(ebay)).toEqual([1, 2, 3]);
    expect(outcome(again, "ebay")).toMatchObject({ fromCache: true, resultCount: 9 });
  });

  it("returns every group up to the page when asked to include earlier pages", async () => {
    const ebay = pagedStore("ebay", 3, 3);
    const response = await setup([ebay.provider]).search({ ...PAGE, page: 2 }, { includeEarlierPages: true });
    expect(response.groups).toHaveLength(8);
    expect(response.groups[0]?.offers[0].providerProductId).toBe("ebay-p1-0");
  });

  it("reads deeper pages from the cache only, in cached mode", async () => {
    const ebay = pagedStore("ebay", 3, 3);
    const { search } = setup([ebay.provider]);
    await search({ ...PAGE, page: 2 }); // caches store pages 1–3
    ebay.search.mockClear();

    const all = await search({ ...PAGE, pageSize: 500 }, { deeperStorePages: "cached" });
    expect(ebay.search).not.toHaveBeenCalled();
    expect(all.groups).toHaveLength(9);

    const fresh = pagedStore("ebay", 3, 3);
    const uncached = await setup([fresh.provider]).search(
      { ...PAGE, pageSize: 500 },
      { deeperStorePages: "cached" },
    );
    expect(storePagesAsked(fresh)).toEqual([1]);
    expect(uncached.groups).toHaveLength(3);
  });

  it("stops at the deepest allowed store page", async () => {
    const ebay = pagedStore("ebay", 10, 2);
    const response = await setup([ebay.provider], { maxStorePages: 2 }).search({ ...PAGE, page: 5 });
    expect(storePagesAsked(ebay)).toEqual([1, 2]);
    expect(response.groups).toEqual([]);
    expect(response.pagination).toMatchObject({ totalResults: 4, hasNextPage: false });
  });

  it("keeps earlier results when a deeper page fails, without flagging the search partial", async () => {
    const ebay = fakeProvider("ebay", (_q, _s, storePage) =>
      storePage === 1 ? okPage(items("ebay", 1, 2), true) : failure("ebay", "upstream_error"),
    );
    const response = await setup([ebay.provider]).search({ ...PAGE, page: 2, pageSize: 2 });
    expect(storePagesAsked(ebay)).toEqual([1, 2]);
    expect(response.isPartial).toBe(false);
    expect(outcome(response, "ebay")?.status).toBe("ok");
    expect(response.pagination).toMatchObject({ totalResults: 2, hasNextPage: false });
  });

  it("drops an item a store repeats on a later page", async () => {
    const [first, second] = items("ebay", 1, 2);
    const ebay = fakeProvider("ebay", (_q, _s, storePage) =>
      storePage === 1 && first && second ? okPage([first], true) : okPage([first!, second!]),
    );
    const response = await setup([ebay.provider]).search(
      { ...PAGE, page: 2, pageSize: 1 },
      {
        includeEarlierPages: true,
      },
    );
    expect(response.groups.map((g) => g.offers[0].id)).toEqual([first?.id, second?.id]);
    expect(outcome(response, "ebay")?.resultCount).toBe(2);
  });

  it("treats cache entries without a paging flag as the last page", async () => {
    const ebay = pagedStore("ebay", 3, 2);
    const ctx = setup([ebay.provider]);
    await ctx.cache.set(
      searchCacheKey(PAGE, "ebay"),
      // Shape written before paging existed.
      JSON.parse(JSON.stringify({ products: items("ebay", 1, 2), cachedAt: "2026-10-01T00:00:00.000Z" })),
      60,
    );
    const response = await ctx.search({ ...PAGE, page: 2 });
    expect(ebay.search).not.toHaveBeenCalled();
    expect(response.pagination.hasNextPage).toBe(false);
  });
});

describe("searchProducts — stores that won't ship, and what the shopper named", () => {
  const noOffer = {
    id: "amazon:B09XS7JWHH",
    provider: "amazon" as const,
    providerProductId: "B09XS7JWHH",
    title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
    productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
    imageUrl: null,
    reason: "no_offer_to_destination" as const,
  };
  const XM5: SearchQuery = {
    ...QUERY,
    rawText: "sony wh-1000xm5",
    normalizedText: "sony wh-1000xm5",
    sort: "relevance",
  };
  const headphones = makeProduct({
    provider: "ebay",
    sku: "h",
    title: "Sony WH-1000XM5 Headphones Black",
    total: 1066_00,
  });
  const pads = makeProduct({
    provider: "ebay",
    sku: "p",
    title: "Earpads for Sony WH-1000XM5",
    total: 25_00,
  });

  it("attaches Amazon's no-offer listing to the matching group, from the cache too", async () => {
    const amazon = fakeProvider("amazon", () => ok({ products: [], hasMore: false, unavailable: [noOffer] }));
    const ebay = fakeProvider("ebay", () => okPage([pads, headphones]));
    const { search } = setup([amazon.provider, ebay.provider]);
    for (const response of [await search(XM5), await search(XM5)]) {
      const [top, second] = response.groups;
      expect(top?.offers[0].id).toBe(headphones.id);
      expect(top?.unavailable).toEqual([noOffer]);
      expect(second?.offers[0].id).toBe(pads.id);
      expect(second?.unavailable).toEqual([]);
    }
    expect(amazon.search).toHaveBeenCalledTimes(1);
  });
});
