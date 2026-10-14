import "server-only";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { createClickReport, israelDay, type ClickReport } from "@/application/affiliate/click-report";
import {
  createRecordPriceHistory,
  observationsFrom,
  type Observed,
  type PriceHistoryRun,
} from "@/application/deals/price-history";
import { selectSavings, type SavingsCard } from "@/application/deals/savings";
import type { PriceDropBoard, PriceDropCard } from "@/domain/deals/ports";
import { createRedisPriceDropBoard } from "@/infrastructure/cache/redis-price-drop-board";
import { createSupabasePriceHistory } from "@/infrastructure/db/supabase-price-history";
import {
  createResolveOutboundLink,
  type OutboundLinkError,
  type ResolvedOutboundLink,
} from "@/application/affiliate/resolve-outbound-link";
import {
  buildSearchQuery,
  parseSearchParams,
  type QueryTranslationInfo,
  type RawSearchParams,
} from "@/application/search/build-search-query";
import {
  createTrendingShowcase,
  warmTrendingSearches,
  type TrendingCard,
  type TrendingShowcase,
} from "@/application/deals/trending-showcase";
import { createSearchProducts, type SearchProducts } from "@/application/search/search-products";
import { createRateLimiter, type RateLimiter } from "@/application/security/rate-limiter";
import { storeChecks, storeSearches } from "@/application/search/store-fallback";
import { FALLBACK_FX_RATES } from "@/config/fallback-fx-rates";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { DEFAULT_AMAZON_WARM_PER_DAY, DEFAULT_DAILY_CALL_BUDGETS } from "@/config/rate-limits";
import { DEFAULT_TRENDING_WARM_STORES, DEMO_TRENDING_QUERIES, TRENDING_QUERIES } from "@/config/trending";
import { DEMO_HOME_CATEGORIES, HOME_CATEGORIES, type HomeCategory } from "@/config/home";
import type { TrendingQuery } from "@/domain/deals/trending-query";
import { amazonSource, ebayCredentials, env } from "@/config/env";
import type { OutboundLinkCodec } from "@/domain/affiliate/ports";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProductSearchProvider } from "@/domain/search/product-search-provider";
import type { SearchResponse } from "@/domain/search/search-response";
import type { QueryTranslator, StoreCallBudget } from "@/domain/search/ports";
import { PROVIDER_IDS, type ProviderId } from "@/domain/shared/provider";
import type { Result } from "@/domain/shared/result";
import { createAffiliateLinkBuilder } from "@/infrastructure/affiliate/affiliate-link-builder";
import { consoleClickRecorder } from "@/infrastructure/affiliate/console-click-recorder";
import { createHmacOutboundLinkCodec } from "@/infrastructure/affiliate/outbound-link-codec";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { createInMemoryUserLists } from "@/infrastructure/db/in-memory-user-lists";
import { createInMemoryPushSubscriptions } from "@/infrastructure/db/in-memory-push-subscriptions";
import { createSupabaseServiceClient } from "@/infrastructure/db/supabase-clients";
import {
  createSupabaseClickRecorder,
  createSupabaseClickStats,
} from "@/infrastructure/db/supabase-outbound-clicks";
import { createRedisCircuitBreakerStore } from "@/infrastructure/cache/redis-circuit-breaker-store";
import { createRedisSearchCache } from "@/infrastructure/cache/redis-search-cache";
import { createInMemoryCounterStore } from "@/infrastructure/cache/counter-stores";
import { createUpstashCounterStore, createUpstashRedis } from "@/infrastructure/cache/upstash";
import { createCachedFxRates } from "@/infrastructure/fx/cached-fx-rates";
import { createFrankfurterFxSource } from "@/infrastructure/fx/frankfurter-fx-source";
import { consoleLogger } from "@/infrastructure/logging/console-logger";
import { createAliExpressProvider } from "@/infrastructure/providers/aliexpress/aliexpress-adapter";
import { createAliExpressLinkGenerator } from "@/infrastructure/providers/aliexpress/aliexpress-link-generator";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
import { createRecordedSerpApiFetch } from "@/infrastructure/providers/amazon/amazon-recorded";
import { createEbayTokenProvider } from "@/infrastructure/providers/ebay/ebay-oauth";
import { DEMO_CATALOG, DEMO_FX } from "@/infrastructure/providers/demo/demo-catalog";
import { createDemoProvider } from "@/infrastructure/providers/demo/demo-provider";
import { createDeepLTranslator } from "@/infrastructure/translation/deepl-translator";
import { createQueryTranslator } from "@/infrastructure/translation/query-translator";

/**
 * Composition root: the only place that knows which concrete adapters exist.
 * Built once per server instance and reused across requests.
 */
interface Services {
  readonly searchProducts: SearchProducts;
  readonly trendingShowcase: TrendingShowcase;
  readonly trendingQueries: readonly TrendingQuery[];
  readonly trendingWarmStores: readonly ProviderId[];
  /** Homepage category rows; their products are warmed with the trending ones. */
  readonly homeCategories: readonly HomeCategory[];
  /** Amazon trending queries refreshed per day (0: Amazon isn't warmed). */
  readonly amazonWarmPerDay: number;
  /** The search path for cache warming: same stores and cache, its own Amazon budget. */
  readonly warmSearchProducts: SearchProducts;
  readonly translator: QueryTranslator;
  readonly linkCodec: OutboundLinkCodec;
  readonly resolveOutboundLink: ReturnType<typeof createResolveOutboundLink>;
  /** Null without Supabase's service key: clicks are only logged then. */
  readonly clickReport: ReturnType<typeof createClickReport> | null;
  /** Null without Supabase's service key: no price history, so no drops. */
  readonly recordPriceHistory: ReturnType<typeof createRecordPriceHistory> | null;
  readonly priceDropBoard: PriceDropBoard;
  readonly demoMode: boolean;
  /** Stores answering from recorded samples (development); the UI labels them. */
  readonly sampleStores: readonly ProviderId[];
  /** Where wishlists and alerts live; see `src/app/_user-lists.ts`. */
  readonly userListsBackend: UserListsBackend;
}

export type UserListsBackend =
  | {
      readonly kind: "supabase";
      readonly url: string;
      readonly publishableKey: string;
      readonly secretKey?: string;
    }
  | {
      readonly kind: "memory";
      readonly store: ReturnType<typeof createInMemoryUserLists>;
      readonly push: ReturnType<typeof createInMemoryPushSubscriptions>;
    }
  | { readonly kind: "none" };

/**
 * One instance per server process. Kept on globalThis because Next bundles
 * route handlers and pages separately: a module-level variable would exist
 * once per bundle, splitting in-memory state (demo wishlists, caches).
 */
const SERVICES_KEY = Symbol.for("onecart.services");
type ServicesHolder = { [SERVICES_KEY]?: Services };

function buildServices(): Services {
  const config = env();
  const logger = consoleLogger;
  const redis = createUpstashRedis(config) ?? createInMemoryRedis();
  const demoMode = config.ONECART_DEMO_PROVIDERS;

  const providers: ProductSearchProvider[] = [];
  /** Stores answering from recorded samples rather than live. */
  const sampleStores: ProviderId[] = [];
  if (demoMode) {
    logger.warn("composition: demo providers enabled — results are sample data");
    for (const provider of PROVIDER_IDS) {
      providers.push(
        createDemoProvider({ provider, catalog: DEMO_CATALOG, policy: ISRAEL_IMPORT_POLICY, fx: DEMO_FX }),
      );
    }
  } else {
    const getFxRates = createCachedFxRates({
      source: createFrankfurterFxSource(),
      store: redis,
      fallback: FALLBACK_FX_RATES,
      logger,
    });
    const amazon = amazonSource(config);
    if (amazon !== "off") {
      if (amazon === "recorded")
        logger.warn(
          "composition: Amazon serves recorded SerpApi responses (SERPAPI_MODE=live for real ones)",
        );
      providers.push(
        createAmazonProvider({
          // Recorded mode never sends a request; a key isn't needed or used.
          apiKey: amazon === "live" ? (config.SERPAPI_API_KEY ?? "") : "recorded",
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates,
          pages: config.SERPAPI_AMAZON_PAGES,
          ...(amazon === "recorded" ? { fetch: createRecordedSerpApiFetch(), cacheScope: "recorded" } : {}),
        }),
      );
      if (amazon === "recorded") sampleStores.push("amazon");
    }
    const ebay = ebayCredentials(config);
    if (ebay) {
      providers.push(
        createEbayProvider({
          tokens: createEbayTokenProvider(ebay),
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates,
          ...(config.AFFILIATE_EBAY_CAMPAIGN_ID
            ? { affiliateCampaignId: config.AFFILIATE_EBAY_CAMPAIGN_ID }
            : {}),
        }),
      );
    }
    if (config.ALIEXPRESS_APP_KEY && config.ALIEXPRESS_APP_SECRET) {
      providers.push(
        createAliExpressProvider({
          appKey: config.ALIEXPRESS_APP_KEY,
          appSecret: config.ALIEXPRESS_APP_SECRET,
          ...(config.AFFILIATE_ALIEXPRESS_TRACKING_ID
            ? { trackingId: config.AFFILIATE_ALIEXPRESS_TRACKING_ID }
            : {}),
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates,
        }),
      );
    }
  }

  const searchCache = createRedisSearchCache(redis);

  const translator = createQueryTranslator({
    cache: redis,
    deepl: config.DEEPL_API_KEY ? createDeepLTranslator({ apiKey: config.DEEPL_API_KEY }) : null,
    logger,
  });

  const linkCodec = createHmacOutboundLinkCodec(
    outboundLinkSecret(config.OUTBOUND_LINK_SECRET, config.NODE_ENV, demoMode),
  );

  const userListsBackend: UserListsBackend =
    config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? {
          kind: "supabase",
          url: config.NEXT_PUBLIC_SUPABASE_URL,
          publishableKey: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          ...(config.SUPABASE_SECRET_KEY ? { secretKey: config.SUPABASE_SECRET_KEY } : {}),
        }
      : demoMode
        ? { kind: "memory", store: createInMemoryUserLists(), push: createInMemoryPushSubscriptions() }
        : { kind: "none" };

  const priceDropBoard = createRedisPriceDropBoard(redis);

  const searchDeps = {
    providers,
    cache: searchCache,
    circuitBreaker: createRedisCircuitBreakerStore(redis),
    cacheTtlSeconds: config.SEARCH_CACHE_TTL_SECONDS,
    logger,
  };
  const amazonWarmPerDay = config.AMAZON_WARM_PER_DAY ?? DEFAULT_AMAZON_WARM_PER_DAY;
  const shopperBudget = demoMode
    ? null
    : createCallBudget(config, providers, logger, "budget", {
        ebay: config.EBAY_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.ebay,
        amazon: config.AMAZON_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.amazon,
        aliexpress: config.ALIEXPRESS_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.aliexpress,
      });
  const warmBudget = demoMode
    ? null
    : createCallBudget(config, providers, logger, "budget-warm", { amazon: amazonWarmPerDay });

  // Server-side only and never request-scoped: the click and price tables have no policies for visitors.
  const serviceDb =
    config.NEXT_PUBLIC_SUPABASE_URL && config.SUPABASE_SECRET_KEY
      ? createSupabaseServiceClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY)
      : null;

  return {
    userListsBackend,
    linkCodec,
    clickReport: serviceDb ? createClickReport({ stats: createSupabaseClickStats(serviceDb) }) : null,
    priceDropBoard,
    recordPriceHistory: serviceDb
      ? createRecordPriceHistory({
          history: createSupabasePriceHistory(serviceDb),
          board: priceDropBoard,
          logger,
        })
      : null,
    resolveOutboundLink: createResolveOutboundLink({
      codec: linkCodec,
      affiliate: createAffiliateLinkBuilder({
        ...(config.AFFILIATE_AMAZON_TAG ? { amazonTag: config.AFFILIATE_AMAZON_TAG } : {}),
        ...(config.AFFILIATE_EBAY_CAMPAIGN_ID ? { ebayCampaignId: config.AFFILIATE_EBAY_CAMPAIGN_ID } : {}),
        // Demo products aren't real listings: never send them to the live link API.
        ...(!demoMode &&
        config.ALIEXPRESS_APP_KEY &&
        config.ALIEXPRESS_APP_SECRET &&
        config.AFFILIATE_ALIEXPRESS_TRACKING_ID
          ? {
              aliexpress: createAliExpressLinkGenerator({
                appKey: config.ALIEXPRESS_APP_KEY,
                appSecret: config.ALIEXPRESS_APP_SECRET,
                trackingId: config.AFFILIATE_ALIEXPRESS_TRACKING_ID,
                cache: redis,
                logger,
              }),
            }
          : {}),
      }),
      clicks: serviceDb ? createSupabaseClickRecorder(serviceDb) : consoleClickRecorder,
      // The redirect is sent first; the click is written after the response.
      defer: after,
      logger,
    }),
    trendingShowcase: createTrendingShowcase({
      cache: searchCache,
      stores: providers.map((p) => ({ id: p.id, ...(p.cacheScope ? { cacheScope: p.cacheScope } : {}) })),
      logger,
    }),
    trendingQueries: demoMode ? DEMO_TRENDING_QUERIES : TRENDING_QUERIES,
    homeCategories: demoMode ? DEMO_HOME_CATEGORIES : HOME_CATEGORIES,
    // Demo stores are free to "call"; live ones follow TRENDING_WARM_STORES.
    trendingWarmStores: demoMode
      ? providers.map((p) => p.id)
      : (config.TRENDING_WARM_STORES ?? DEFAULT_TRENDING_WARM_STORES),
    amazonWarmPerDay: demoMode ? 0 : amazonWarmPerDay,
    searchProducts: createSearchProducts({
      ...searchDeps,
      ...(shopperBudget ? { callBudget: shopperBudget } : {}),
    }),
    warmSearchProducts: createSearchProducts({
      ...searchDeps,
      ...(shopperBudget && warmBudget
        ? {
            // Amazon warming spends its own budget, never shoppers'; other stores share theirs.
            callBudget: (provider: ProviderId) =>
              provider === "amazon" ? warmBudget(provider) : shopperBudget(provider),
          }
        : {}),
    }),
    translator,
    demoMode,
    sampleStores,
  };
}

/**
 * Daily live-call caps for the stores we call for real (not recorded or demo
 * data), counted in Upstash so every instance shares them.
 */
function createCallBudget(
  config: ReturnType<typeof env>,
  providers: readonly ProductSearchProvider[],
  logger: typeof consoleLogger,
  /** Counter key prefix: separate prefixes are separate budgets. */
  prefix: string,
  limits: Partial<Record<ProviderId, number>>,
): StoreCallBudget {
  const counter = createUpstashCounterStore(config) ?? createInMemoryCounterStore();
  const limiters = new Map<ProviderId, RateLimiter>();
  for (const provider of providers) {
    const limit = limits[provider.id];
    if (limit === undefined || provider.cacheScope) continue;
    limiters.set(
      provider.id,
      createRateLimiter({
        prefix,
        windows: [{ name: "day", limit, windowSeconds: 24 * 60 * 60 }],
        counter,
        logger,
      }),
    );
  }
  return async (provider) => {
    const limiter = limiters.get(provider);
    return limiter ? (await limiter(provider)).allowed : true;
  };
}

/**
 * Production must share one secret across instances, or a link rendered by
 * one instance fails on another. Dev and demo fall back to a per-process key.
 */
function outboundLinkSecret(secret: string | undefined, nodeEnv: string, demoMode: boolean): string {
  if (secret) return secret;
  if (nodeEnv === "production" && !demoMode) {
    throw new Error("OUTBOUND_LINK_SECRET is required in production (≥32 chars)");
  }
  consoleLogger.warn(
    "composition: OUTBOUND_LINK_SECRET not set — using a per-process key; /go links reset on restart",
  );
  return randomBytes(48).toString("base64url");
}

export function getServices(): Services {
  const holder = globalThis as ServicesHolder;
  holder[SERVICES_KEY] ??= buildServices();
  return holder[SERVICES_KEY];
}

export type SearchPageResult =
  | { readonly kind: "no_query" }
  | {
      readonly kind: "results";
      readonly response: SearchResponse;
      readonly translation: QueryTranslationInfo | null;
      readonly demoMode: boolean;
      /** Offer id → signed `/go/...` href for every offer shown (all pages through this one). */
      readonly outboundLinks: Readonly<Record<string, string>>;
      /** Group id → a store that's down and a signed link to search it ("Check Amazon"). */
      readonly storeChecks: Readonly<
        Record<string, { readonly provider: ProviderId; readonly href: string }>
      >;
      /** Unavailable stores, each with a signed link to search its own site for the query. */
      readonly storeSearches: readonly { readonly provider: ProviderId; readonly href: string }[];
      readonly sampleStores: readonly ProviderId[];
    };

/** Everything the /search page needs, from raw URL params. */
export async function searchFromParams(params: RawSearchParams): Promise<SearchPageResult> {
  const request = parseSearchParams(params);
  if (!request.ok) return { kind: "no_query" };

  const { searchProducts, translator, demoMode, linkCodec, sampleStores } = getServices();
  const { query, translation } = await buildSearchQuery(request.value, translator, consoleLogger);
  // Cumulative: "Load more" re-renders every card through the requested page.
  const response = await searchProducts(query, { includeEarlierPages: true });

  const outboundLinks: Record<string, string> = {};
  // "Won't ship to Israel" listings get signed links too: the shopper may still want to look.
  for (const offer of response.groups.flatMap((g) => [...g.listings, ...g.unavailable])) {
    outboundLinks[offer.id] = linkCodec.encode({
      id: offer.id,
      provider: offer.provider,
      url: offer.productUrl,
    });
  }
  const checks: Record<string, { provider: ProviderId; href: string }> = {};
  for (const [groupId, target] of Object.entries(storeChecks(response))) {
    checks[groupId] = { provider: target.provider, href: linkCodec.encode(target) };
  }
  return {
    kind: "results",
    response,
    translation,
    demoMode,
    outboundLinks,
    storeChecks: checks,
    storeSearches: storeSearches(response).map((t) => ({ provider: t.provider, href: linkCodec.encode(t) })),
    sampleStores,
  };
}

/** Showcase cards are cache reads; reuse them briefly so homepage traffic doesn't multiply Redis calls. */
const SHOWCASE_MEMO_MS = 5 * 60 * 1000;
const SHOWCASE_KEY = Symbol.for("onecart.showcaseMemo");
const CATEGORIES_KEY = Symbol.for("onecart.categoryRowsMemo");
const DROPS_KEY = Symbol.for("onecart.priceDropsMemo");

export interface CategoryRow {
  readonly category: HomeCategory;
  readonly cards: readonly TrendingCard[];
}

type Memo<T> = { readonly value: T; readonly atMs: number };
type MemoHolder = {
  [SHOWCASE_KEY]?: Memo<TrendingCard[]>;
  [CATEGORIES_KEY]?: Memo<CategoryRow[]>;
  [DROPS_KEY]?: Memo<{ readonly drop: PriceDropCard; readonly href: string }[]>;
};

const fresh = (memo: Memo<unknown> | undefined) => !!memo && Date.now() - memo.atMs < SHOWCASE_MEMO_MS;

/**
 * The homepage "Trending" cards, from cached search results only (never a
 * store API call). An empty result isn't memoized, so cards appear as soon
 * as the cache is warmed.
 */
export async function trendingCards(): Promise<TrendingCard[]> {
  const holder = globalThis as MemoHolder;
  const memo = holder[SHOWCASE_KEY];
  if (memo && fresh(memo)) return memo.value;
  const { trendingShowcase, trendingQueries } = getServices();
  const cards = await trendingShowcase(trendingQueries);
  if (cards.length > 0) holder[SHOWCASE_KEY] = { value: cards, atMs: Date.now() };
  return cards;
}

/** The homepage category rows, cached results only; a category with no cards is left out. */
export async function categoryRows(): Promise<CategoryRow[]> {
  const holder = globalThis as MemoHolder;
  const memo = holder[CATEGORIES_KEY];
  if (memo && fresh(memo)) return memo.value;
  const { trendingShowcase, homeCategories } = getServices();
  const rows = await Promise.all(
    homeCategories.map(async (category) => ({ category, cards: await trendingShowcase(category.products) })),
  );
  const filled = rows.filter((row) => row.cards.length > 0);
  if (filled.length > 0) holder[CATEGORIES_KEY] = { value: filled, atMs: Date.now() };
  return filled;
}

/** Price history after a warm run; its failure never fails the warm-up itself. */
async function recordPrices(
  observed: readonly Observed[],
  today: string,
): Promise<PriceHistoryRun | "not_configured" | "error"> {
  const record = getServices().recordPriceHistory;
  if (!record) return "not_configured";
  try {
    return await record(observed, today);
  } catch (error) {
    consoleLogger.warn("price-history: run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/** Today's price drops (cache only), each with a signed /go link to the listing. */
export async function priceDropCards(): Promise<{ readonly drop: PriceDropCard; readonly href: string }[]> {
  const holder = globalThis as MemoHolder;
  const memo = holder[DROPS_KEY];
  if (memo && fresh(memo)) return memo.value;
  const { priceDropBoard, linkCodec } = getServices();
  let drops: readonly PriceDropCard[] = [];
  try {
    drops = await priceDropBoard.load();
  } catch (error) {
    consoleLogger.warn("price-drops: board read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const cards = drops.map((drop) => ({
    drop,
    href: linkCodec.encode({ id: drop.productId, provider: drop.provider, url: drop.productUrl }),
  }));
  holder[DROPS_KEY] = { value: cards, atMs: Date.now() };
  return cards;
}

/** Cross-store savings among the homepage's own cards (trending and categories). */
export async function savingsCards(): Promise<SavingsCard[]> {
  const [trending, rows] = await Promise.all([trendingCards(), categoryRows()]);
  return selectSavings([...trending, ...rows.flatMap((r) => r.cards)]);
}

/** Category searches warmed at once: ~30 queries finish in well under a minute. */
const CATEGORY_WARM_CONCURRENCY = 3;

/**
 * Runs the trending searches (Amazon on its rotation) and then every category
 * product on the daily stores, so the homepage has fresh cached results (cron).
 */
export async function warmTrending() {
  const { warmSearchProducts, trendingQueries, homeCategories, trendingWarmStores, amazonWarmPerDay } =
    getServices();
  const holder = globalThis as MemoHolder;
  delete holder[SHOWCASE_KEY];
  delete holder[CATEGORIES_KEY];
  const atMs = Date.now();
  const today = israelDay(new Date(atMs));
  const observed: Observed[] = [];
  const onWarmed = (query: string, response: SearchResponse) =>
    observed.push(...observationsFrom(query, response, today));
  const trending = await warmTrendingSearches(
    warmSearchProducts,
    trendingQueries,
    {
      daily: trendingWarmStores,
      rotating: amazonWarmPerDay > 0 ? [{ provider: "amazon", perDay: amazonWarmPerDay }] : [],
      atMs,
    },
    { onWarmed },
  );
  const categories = await warmTrendingSearches(
    warmSearchProducts,
    homeCategories.flatMap((c) => c.products),
    { daily: trendingWarmStores, rotating: [], atMs },
    { concurrency: CATEGORY_WARM_CONCURRENCY, onWarmed },
  );
  delete holder[DROPS_KEY];
  return { trending, categories, priceHistory: await recordPrices(observed, today) };
}

/** The /go/[id] decision; see `createResolveOutboundLink`. */
export function resolveOutboundLink(
  id: string,
  params: Readonly<Record<string, string | undefined>>,
): Promise<Result<ResolvedOutboundLink, OutboundLinkError>> {
  return getServices().resolveOutboundLink(id, params);
}

/** Outbound clicks for the last `days` days; failures are logged here, the page just says so. */
export async function clickReport(days: number): Promise<ClickReport | "not_configured" | "error"> {
  const report = getServices().clickReport;
  if (!report) return "not_configured";
  try {
    return await report(days);
  } catch (error) {
    consoleLogger.warn("internal/clicks: report failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/** Every result group is wanted here, not one page of them. */
const ALL_RESULTS_PAGE_SIZE = 500;

/**
 * All offers for a user's original search text (Hebrew or English), using the
 * same translation and (cached) search path as the results page. Null when
 * every store failed, so callers don't mistake an outage for "not found".
 */
export async function offersFor(searchText: string): Promise<UnifiedProduct[] | null> {
  const request = parseSearchParams({ q: searchText });
  if (!request.ok) return [];
  const { searchProducts, translator } = getServices();
  const { query } = await buildSearchQuery(request.value, translator, consoleLogger);
  // Include deeper store pages a shopper already loaded, without paying for new ones.
  const response = await searchProducts(
    { ...query, page: 1, pageSize: ALL_RESULTS_PAGE_SIZE },
    { deeperStorePages: "cached" },
  );
  const searched = response.providers.filter((p) => p.status !== "skipped");
  if (searched.length > 0 && searched.every((p) => ["timeout", "error", "circuit_open"].includes(p.status)))
    return null;
  return response.groups.flatMap((g) => [...g.listings]);
}

/** The product with this id in today's results for `searchText`, or null. */
export async function findOffer(productId: string, searchText: string): Promise<UnifiedProduct | null> {
  return (await offersFor(searchText))?.find((o) => o.id === productId) ?? null;
}
