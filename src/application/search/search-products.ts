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
import type { ProductSearchProvider, ProviderError } from "@/domain/search/product-search-provider";
import { groupProducts } from "@/domain/search/product-group";
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

export interface SearchProductsDeps {
  /** Enabled providers only; a provider with missing credentials is simply not passed in. */
  readonly providers: readonly ProductSearchProvider[];
  readonly cache: SearchResultCache;
  readonly circuitBreaker: CircuitBreakerStore;
  readonly circuitBreakerPolicy?: CircuitBreakerPolicy;
  readonly providerTimeoutMs?: number;
  readonly cacheTtlSeconds?: number;
  /** Epoch milliseconds. Injected for deterministic tests. */
  readonly now?: () => number;
  readonly logger?: Logger;
}

export type SearchProducts = (
  query: SearchQuery,
  options?: { readonly signal?: AbortSignal },
) => Promise<SearchResponse>;

interface ProviderRun {
  readonly outcome: ProviderOutcome;
  readonly products: readonly UnifiedProduct[];
}

type CallResult = Result<readonly UnifiedProduct[], ProviderError>;

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
 * hard deadline). One provider's failure never affects the others. Providers
 * are always asked for page 1 — sort, filters, and pagination are applied
 * here, after the cache, so they never fragment it.
 */
export function createSearchProducts(deps: SearchProductsDeps): SearchProducts {
  const policy = deps.circuitBreakerPolicy ?? DEFAULT_CIRCUIT_BREAKER_POLICY;
  const timeoutMs = deps.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const ttlSeconds = deps.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
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

  async function runProvider(
    provider: ProductSearchProvider,
    query: SearchQuery,
    signal: AbortSignal | undefined,
  ): Promise<ProviderRun> {
    const id = provider.id;
    const base = { provider: id, resultCount: 0, latencyMs: null, fromCache: false } as const;

    if (query.providers && query.providers.length > 0 && !query.providers.includes(id)) {
      return { outcome: { ...base, status: "skipped" }, products: [] };
    }

    const cacheKey = searchCacheKey(query, id);
    const cached = await safely("cache read", null, () => deps.cache.get(cacheKey), id);
    if (cached) {
      const count = cached.products.length;
      return {
        outcome: { ...base, status: count > 0 ? "ok" : "empty", resultCount: count, fromCache: true },
        products: cached.products,
      };
    }

    const state: CircuitState | null = await safely(
      "circuit read",
      null,
      () => deps.circuitBreaker.get(id),
      id,
    );
    const decision: CircuitDecision = decideCircuit(state, now(), policy);
    if (decision === "reject") {
      return { outcome: { ...base, status: "circuit_open" }, products: [] };
    }

    const startedAt = now();
    const providerQuery: SearchQuery = { ...query, page: 1 };
    const result = await withDeadline(
      (callSignal) =>
        // `.then` turns a synchronous throw inside the adapter into a rejection the `.catch` sees.
        Promise.resolve()
          .then(() => provider.search(providerQuery, { signal: callSignal }))
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
      timeoutMs,
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
      };
    }

    const products = result.value;
    await Promise.all([
      // Skip the write when already closed and clean — saves a Redis call per search.
      state === null || state.status === "open" || state.consecutiveFailures > 0
        ? safely("circuit write", undefined, () => deps.circuitBreaker.set(id, circuitAfterSuccess()), id)
        : Promise.resolve(),
      // A legitimate "0 results" is cached too; failures above never are.
      safely(
        "cache write",
        undefined,
        () => deps.cache.set(cacheKey, { products, cachedAt: new Date(now()).toISOString() }, ttlSeconds),
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
    };
  }

  return async function searchProducts(query, options) {
    const runs = await Promise.all(deps.providers.map((p) => runProvider(p, query, options?.signal)));

    const offers = filterOffers(
      runs.flatMap((r) => r.products),
      query.filters,
    );
    // Each store returns its best matches first; remember those positions for relevance sorting.
    const ranks = new Map<string, number>();
    for (const run of runs) run.products.forEach((product, index) => ranks.set(product.id, index));
    const groups = sortGroups(groupProducts(offers), query.sort, (id) => ranks.get(id));
    const { items, pagination } = paginate(groups, query.page, query.pageSize);
    const outcomes = runs.map((r) => r.outcome);

    return {
      query,
      groups: items,
      totalOffers: offers.length,
      providers: outcomes,
      pagination,
      isPartial: outcomes.some((o) => FAILED_PROVIDER_STATUSES.includes(o.status)),
      generatedAt: new Date(now()).toISOString(),
    };
  };
}
