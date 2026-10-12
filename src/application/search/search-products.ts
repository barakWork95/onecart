import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import {
  circuitAfterFailure,
  circuitAfterSuccess,
  decideCircuit,
  DEFAULT_CIRCUIT_BREAKER_POLICY,
  type CircuitBreakerPolicy,
  type CircuitDecision,
  type CircuitState,
} from "@/domain/search/circuit-breaker";
import type {
  ProductSearchProvider,
  ProviderError,
  ProviderPage,
} from "@/domain/search/product-search-provider";
import { groupProducts } from "@/domain/search/product-group";
import { classifyOffers, searchIntent, type SearchIntent } from "@/domain/search/search-intent";
import type { CircuitBreakerStore, SearchResultCache } from "@/domain/search/ports";
import { filterOffers, paginate, sortGroups } from "@/domain/search/result-ordering";
import { searchCacheKey, type SearchQuery } from "@/domain/search/search-query";
import {
  FAILED_PROVIDER_STATUSES,
  type ProviderOutcome,
  type SearchResponse,
} from "@/domain/search/search-response";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { Result } from "@/domain/shared/result";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 4_000;
export const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24;
/**
 * Deepest store page "Load more" may reach. Amazon's later pages cost one
 * SerpApi credit each, so this caps the spend per query (every page is cached).
 */
export const DEFAULT_MAX_STORE_PAGES = 5;

export interface SearchProductsDeps {
  /** Enabled providers only; a provider with missing credentials is simply not passed in. */
  readonly providers: readonly ProductSearchProvider[];
  readonly cache: SearchResultCache;
  readonly circuitBreaker: CircuitBreakerStore;
  readonly circuitBreakerPolicy?: CircuitBreakerPolicy;
  readonly providerTimeoutMs?: number;
  readonly cacheTtlSeconds?: number;
  readonly maxStorePages?: number;
  /** Epoch milliseconds. Injected for deterministic tests. */
  readonly now?: () => number;
  readonly logger?: Logger;
}

/**
 * How far past store page 1 a search may go to fill the requested results page:
 * - `none`: page 1 only, so a first search never costs more than one call per store;
 * - `cached`: also read deeper store pages already cached, never call a store for them;
 * - `fetch`: fetch deeper store pages (cache first) until the results page is full.
 */
export type DeeperStorePages = "none" | "cached" | "fetch";

export interface SearchProductsOptions {
  readonly signal?: AbortSignal;
  /** Defaults to `fetch` past results page 1 (the shopper asked for more) and `none` on it. */
  readonly deeperStorePages?: DeeperStorePages;
  /** Return every group up to the requested page ("Load more" re-renders the whole list). */
  readonly includeEarlierPages?: boolean;
}

export type SearchProducts = (query: SearchQuery, options?: SearchProductsOptions) => Promise<SearchResponse>;

interface ProviderRun {
  readonly outcome: ProviderOutcome;
  readonly products: readonly UnifiedProduct[];
  readonly hasMore: boolean;
  readonly unavailable: readonly UnavailableListing[];
}

/** One provider's store pages loaded so far for this search. */
interface ProviderProgress {
  readonly provider: ProductSearchProvider;
  readonly runs: ProviderRun[];
  /** A deeper page failed or wasn't cached: stop paging this store for this search. */
  stopped: boolean;
}

type CallResult = Result<ProviderPage, ProviderError>;

const TIMED_OUT = Symbol("timed-out");

/**
 * Hard deadline independent of the adapter: even an adapter that ignores its
 * AbortSignal cannot hold the search past `ms`.
 */
async function withDeadline(
  run: (signal: AbortSignal) => Promise<CallResult>,
  ms: number,
  outer: AbortSignal | undefined,
): Promise<CallResult | typeof TIMED_OUT> {
  const controller = new AbortController();
  const signal = outer ? AbortSignal.any([outer, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onOuterAbort: (() => void) | undefined;

  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException("Provider deadline exceeded", "TimeoutError"));
      resolve(TIMED_OUT);
    }, ms);
    onOuterAbort = () => resolve(TIMED_OUT);
    if (outer?.aborted) onOuterAbort();
    else outer?.addEventListener("abort", onOuterAbort, { once: true });
  });

  try {
    return await Promise.race([run(signal), deadline]);
  } finally {
    clearTimeout(timer);
    if (onOuterAbort) outer?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Searches every enabled provider in parallel and merges the results.
 *
 * Per provider: query filter → cache → circuit breaker → live call (with a
 * hard deadline). One provider's failure never affects the others. Sort,
 * filters and pagination are applied here, after the cache, so they never
 * fragment it. Results pages come from the store pages already loaded; a
 * deeper store page is requested only when those run out (see
 * `DeeperStorePages`), and every store page is cached on its own key.
 */
export function createSearchProducts(deps: SearchProductsDeps): SearchProducts {
  const policy = deps.circuitBreakerPolicy ?? DEFAULT_CIRCUIT_BREAKER_POLICY;
  const timeoutMs = deps.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const ttlSeconds = deps.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const maxStorePages = deps.maxStorePages ?? DEFAULT_MAX_STORE_PAGES;
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? noopLogger;

  async function safely<T>(
    operation: string,
    fallback: T,
    run: () => Promise<T>,
    provider: string,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      logger.warn(`search: ${operation} failed, continuing without it`, {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  async function readCache(
    id: ProductSearchProvider["id"],
    query: SearchQuery,
    storePage: number,
  ): Promise<ProviderRun | null> {
    const cached = await safely(
      "cache read",
      null,
      () => deps.cache.get(searchCacheKey(query, id, storePage)),
      id,
    );
    if (!cached) return null;
    const count = cached.products.length;
    return {
      outcome: {
        provider: id,
        status: count > 0 ? "ok" : "empty",
        resultCount: count,
        latencyMs: null,
        fromCache: true,
      },
      products: cached.products,
      // Entries cached before paging existed carry no flag: treat them as the last page.
      hasMore: cached.hasMore === true,
      unavailable: cached.unavailable ?? [],
    };
  }

  async function runProvider(
    provider: ProductSearchProvider,
    query: SearchQuery,
    storePage: number,
    signal: AbortSignal | undefined,
  ): Promise<ProviderRun> {
    const id = provider.id;
    const base = { provider: id, resultCount: 0, latencyMs: null, fromCache: false } as const;

    if (query.providers && query.providers.length > 0 && !query.providers.includes(id)) {
      return { outcome: { ...base, status: "skipped" }, products: [], hasMore: false, unavailable: [] };
    }

    const cacheKey = searchCacheKey(query, id, storePage);
    const cached = await readCache(id, query, storePage);
    if (cached) return cached;

    const state: CircuitState | null = await safely(
      "circuit read",
      null,
      () => deps.circuitBreaker.get(id),
      id,
    );
    const decision: CircuitDecision = decideCircuit(state, now(), policy);
    if (decision === "reject") {
      return { outcome: { ...base, status: "circuit_open" }, products: [], hasMore: false, unavailable: [] };
    }

    const startedAt = now();
    const providerQuery: SearchQuery = { ...query, page: 1 };
    const result = await withDeadline(
      (callSignal) =>
        // `.then` turns a synchronous throw inside the adapter into a rejection the `.catch` sees.
        Promise.resolve()
          .then(() => provider.search(providerQuery, { signal: callSignal, storePage }))
          .catch((error: unknown): CallResult => ({
            ok: false,
            error: {
              provider: id,
              kind: "upstream_error",
              code: "ADAPTER_THREW",
              retryable: true,
              detail: error instanceof Error ? error.message : String(error),
            },
          })),
      provider.timeoutMs ?? timeoutMs,
      signal,
    );
    const latencyMs = now() - startedAt;

    if (result === TIMED_OUT || !result.ok) {
      const error: ProviderError =
        result === TIMED_OUT
          ? { provider: id, kind: "timeout", code: "TIMEOUT", retryable: true }
          : result.error;
      // A caller abort (user navigated away) says nothing about the provider's health.
      if (error.retryable && !signal?.aborted) {
        const next = circuitAfterFailure(state, decision, now(), policy);
        await safely("circuit write", undefined, () => deps.circuitBreaker.set(id, next), id);
      }
      logger.warn("search: provider failed", {
        provider: id,
        kind: error.kind,
        code: error.code,
        detail: error.detail,
      });
      return {
        outcome: {
          ...base,
          status: error.kind === "timeout" ? "timeout" : "error",
          latencyMs,
          errorCode: error.code,
        },
        products: [],
        hasMore: false,
        unavailable: [],
      };
    }

    const { products, hasMore } = result.value;
    const unavailable = result.value.unavailable ?? [];
    await Promise.all([
      // Skip the write when already closed and clean — saves a Redis call per search.
      state === null || state.status === "open" || state.consecutiveFailures > 0
        ? safely("circuit write", undefined, () => deps.circuitBreaker.set(id, circuitAfterSuccess()), id)
        : Promise.resolve(),
      // A legitimate "0 results" is cached too; failures above never are.
      safely(
        "cache write",
        undefined,
        () =>
          deps.cache.set(
            cacheKey,
            { products, hasMore, unavailable, cachedAt: new Date(now()).toISOString() },
            ttlSeconds,
          ),
        id,
      ),
    ]);

    return {
      outcome: {
        ...base,
        status: products.length > 0 ? "ok" : "empty",
        resultCount: products.length,
        latencyMs,
      },
      products,
      hasMore,
      unavailable,
    };
  }

  /** The next store page for one provider: live (cache first) or cache-only. */
  async function loadNextPage(
    progress: ProviderProgress,
    query: SearchQuery,
    mode: Exclude<DeeperStorePages, "none">,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const storePage = progress.runs.length + 1;
    const run =
      mode === "fetch"
        ? await runProvider(progress.provider, query, storePage, signal)
        : await readCache(progress.provider.id, query, storePage);
    // A failed deeper page keeps what we have: the store answered page 1 fine.
    if (!run || FAILED_PROVIDER_STATUSES.includes(run.outcome.status)) progress.stopped = true;
    else progress.runs.push(run);
  }

  function canGoDeeper(progress: ProviderProgress): boolean {
    const last = progress.runs[progress.runs.length - 1];
    return !progress.stopped && !!last?.hasMore && progress.runs.length < maxStorePages;
  }

  /** Every store page loaded so far, merged, with each offer's rank in its store. */
  function merge(progress: readonly ProviderProgress[], query: SearchQuery, intent: SearchIntent) {
    const ranks = new Map<string, number>();
    const products: UnifiedProduct[] = [];
    const unavailable = new Map<string, UnavailableListing>();
    for (const { runs } of progress) {
      let rank = 0;
      for (const product of runs.flatMap((r) => r.products)) {
        // Stores repeat items across pages (sponsored slots); the first position counts.
        if (ranks.has(product.id)) continue;
        ranks.set(product.id, rank++);
        products.push(product);
      }
      for (const listing of runs.flatMap((r) => r.unavailable)) unavailable.set(listing.id, listing);
    }
    const offers = filterOffers(products, query.filters);
    // Classified on every loaded offer, before filters, so a price filter can't move the typical price.
    const classes = classifyOffers(products, intent);
    const groups = sortGroups(
      groupProducts(offers, { classes, unavailable: [...unavailable.values()] }),
      query.sort,
      (id) => ranks.get(id),
      intent,
    );
    return { offers, groups, uniqueCount: products.length };
  }

  /** Page 1's outcome, with counts and cache status covering every page loaded. */
  function combinedOutcome({ runs }: ProviderProgress): ProviderOutcome {
    const [first, ...deeper] = runs;
    if (!first) throw new Error("Invariant violated: provider without a first page");
    if (deeper.length === 0) return first.outcome;
    const ids = new Set(runs.flatMap((r) => r.products.map((p) => p.id)));
    return {
      ...first.outcome,
      resultCount: ids.size,
      fromCache: runs.every((r) => r.outcome.fromCache),
    };
  }

  return async function searchProducts(query, options = {}) {
    const signal = options.signal;
    const mode = options.deeperStorePages ?? (query.page > 1 ? "fetch" : "none");
    const pageSize = Math.max(1, Math.floor(query.pageSize));
    const page = Math.max(1, Math.floor(query.page));

    const progress: ProviderProgress[] = await Promise.all(
      deps.providers.map(async (provider) => ({
        provider,
        runs: [await runProvider(provider, query, 1, signal)],
        stopped: false,
      })),
    );

    // Already-loaded results fill pages first; a store is asked for its next page only
    // when they run out. One extra group tells us whether a next results page exists.
    const intent = searchIntent(query.normalizedText);
    let merged = merge(progress, query, intent);
    while (mode !== "none" && merged.groups.length <= page * pageSize) {
      const deeper = progress.filter(canGoDeeper);
      if (deeper.length === 0) break;
      await Promise.all(deeper.map((p) => loadNextPage(p, query, mode, signal)));
      merged = merge(progress, query, intent);
    }

    const { items, pagination } = paginate(merged.groups, page, pageSize);
    const outcomes = progress.map(combinedOutcome);

    return {
      query,
      groups: options.includeEarlierPages ? merged.groups.slice(0, page * pageSize) : items,
      totalOffers: merged.offers.length,
      providers: outcomes,
      pagination: { ...pagination, hasNextPage: pagination.hasNextPage || progress.some(canGoDeeper) },
      isPartial: outcomes.some((o) => FAILED_PROVIDER_STATUSES.includes(o.status)),
      generatedAt: new Date(now()).toISOString(),
    };
  };
}
