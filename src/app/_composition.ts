import "server-only";

import { randomBytes } from "node:crypto";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { after } from "next/server";
import { createCategoryPage, type CategoryPage } from "@/application/deals/category-page";
import { createCheckOpsAlerts, type OpsAlertRun } from "@/application/ops/ops-alerts";
import { photoUrlsToHash } from "@/application/deals/photo-warmup";
import type { ImageHashIndex } from "@/domain/matching/image-hash";
import { dHash } from "@/infrastructure/images/dhash";
import { fetchImage } from "@/infrastructure/images/image-fetcher";
import { createRedisImageHashIndex } from "@/infrastructure/images/redis-image-hash-index";
import { createRecordCronRun } from "@/application/ops/record-cron-run";
import { createStatusReport } from "@/application/ops/status-report";
import { webPushConfig } from "@/config/env";
import type { PushSubscriptionKeys } from "@/domain/notifications/push";
import type { OpsAlertState, OpsStore } from "@/domain/ops/ports";
import type { QuotaSource } from "@/domain/ops/status";
import type { ProviderId as StoreId } from "@/domain/shared/provider";
import { createRedisOpsAlertState } from "@/infrastructure/cache/redis-ops-alert-state";
import { createRedisOpsStore } from "@/infrastructure/cache/redis-ops-store";
import { createSupabaseOpsStats } from "@/infrastructure/db/supabase-ops-stats";
import { createWebPushSender } from "@/infrastructure/notifications/web-push-sender";
import { createBudgetQuota, type BudgetCounter } from "@/infrastructure/ops/budget-quota";
import { createEbayQuota } from "@/infrastructure/ops/ebay-quota";
import { createSerpApiQuota } from "@/infrastructure/ops/serpapi-quota";

/** Store names for status labels (the UI's STORE_META lives in components). */
const STORE_NAMES: Record<StoreId, string> = {
  amazon: "Amazon",
  aliexpress: "AliExpress",
  temu: "Temu",
  ebay: "eBay",
};
import { categoryBySlug, categoryText } from "@/domain/deals/category";
import type { Locale } from "@/domain/shared/locale";
import { createClickReport, israelDay, type ClickReport } from "@/application/affiliate/click-report";
import {
  createRecordPriceHistory,
  observationsFrom,
  type Observed,
  type PriceHistoryRun,
} from "@/application/deals/price-history";
import { selectSavings, type SavingsCard } from "@/application/deals/savings";
import { createClickAnalytics, type ClickDashboard } from "@/application/affiliate/click-analytics";
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
import { CATEGORIES, DEMO_CATEGORIES, type Category } from "@/config/categories";
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
  createSupabaseClickAnalytics,
  createSupabaseClickRecorder,
  createSupabaseClickStats,
} from "@/infrastructure/db/supabase-outbound-clicks";
import { createRedisCircuitBreakerStore } from "@/infrastructure/cache/redis-circuit-breaker-store";
import { createRedisSearchCache } from "@/infrastructure/cache/redis-search-cache";
import { createInMemoryCounterStore } from "@/infrastructure/cache/counter-stores";
import { createFailoverCounterStore, createFailoverRedis } from "@/infrastructure/cache/failover-redis";
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
  readonly categoryPage: ReturnType<typeof createCategoryPage>;
  readonly trendingQueries: readonly TrendingQuery[];
  readonly trendingWarmStores: readonly ProviderId[];
  /** Categories (homepage rows and /c pages); their products are warmed with the trending ones. */
  readonly categories: readonly Category[];
  /** Amazon trending queries refreshed per day (0: Amazon isn't warmed). */
  readonly amazonWarmPerDay: number;
  /** The search path for cache warming: same stores and cache, its own Amazon budget. */
  readonly warmSearchProducts: SearchProducts;
  readonly translator: QueryTranslator;
  /** Cache and glossary only, never DeepL: for Server Actions, which any client can POST. */
  readonly cachedTranslator: QueryTranslator;
  readonly linkCodec: OutboundLinkCodec;
  readonly resolveOutboundLink: ReturnType<typeof createResolveOutboundLink>;
  /** Null without Supabase's service key: clicks are only logged then. */
  readonly clickReport: ReturnType<typeof createClickReport> | null;
  readonly clickAnalytics: ReturnType<typeof createClickAnalytics> | null;
  /** Null without Supabase's service key: no price history, so no drops. */
  readonly recordPriceHistory: ReturnType<typeof createRecordPriceHistory> | null;
  readonly priceDropBoard: PriceDropBoard;
  /** Cron run records (status page, alerts). */
  readonly opsStore: OpsStore;
  readonly recordCronRun: ReturnType<typeof createRecordCronRun>;
  readonly opsAlertState: OpsAlertState;
  /** Product-photo hashes for generic matching: cache reads anywhere, downloads in the warm-up only. */
  readonly imageHashes: ImageHashIndex;
  readonly statusReport: ReturnType<typeof createStatusReport>;
  readonly checkOpsAlerts: ReturnType<typeof createCheckOpsAlerts>;
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
  // Upstash, or memory while it's out of quota or unreachable: pages never fail on Redis.
  const upstash = createUpstashRedis(config);
  const redis = upstash ? createFailoverRedis({ primary: upstash, logger }) : createInMemoryRedis();
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
  const cachedTranslator = createQueryTranslator({ cache: redis, deepl: null, logger });

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
  const opsStore = createRedisOpsStore(redis);
  const showcaseStores = providers.map((p) => ({
    id: p.id,
    ...(p.cacheScope ? { cacheScope: p.cacheScope } : {}),
  }));

  const imageHashes = createRedisImageHashIndex({
    redis,
    hashImage: async (url) => {
      const bytes = await fetchImage(url);
      return bytes ? dHash(bytes).catch(() => null) : null;
    },
  });
  const searchDeps = {
    providers,
    cache: searchCache,
    circuitBreaker: createRedisCircuitBreakerStore(redis),
    cacheTtlSeconds: config.SEARCH_CACHE_TTL_SECONDS,
    imageHashes,
    logger,
  };
  const amazonWarmPerDay = config.AMAZON_WARM_PER_DAY ?? DEFAULT_AMAZON_WARM_PER_DAY;
  const shopperLimits = {
    ebay: config.EBAY_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.ebay,
    amazon: config.AMAZON_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.amazon,
    aliexpress: config.ALIEXPRESS_DAILY_CALL_BUDGET ?? DEFAULT_DAILY_CALL_BUDGETS.aliexpress,
  };
  const shopperBudget = demoMode
    ? null
    : createCallBudget(config, providers, logger, "budget", shopperLimits);
  const warmBudget = demoMode
    ? null
    : createCallBudget(config, providers, logger, "budget-warm", { amazon: amazonWarmPerDay });

  // Quotas for the status page and alerts. Reading them spends nothing: SerpApi's account
  // endpoint is free, eBay's analytics call isn't a Browse call, and counters are plain reads.
  const liveStores = providers.filter((p) => !p.cacheScope).map((p) => p.id);
  const opsQuotas: QuotaSource[] = [];
  if (!demoMode && config.SERPAPI_API_KEY)
    opsQuotas.push(createSerpApiQuota({ apiKey: config.SERPAPI_API_KEY }));
  const ebayKeys = ebayCredentials(config);
  if (!demoMode && ebayKeys) opsQuotas.push(createEbayQuota({ tokens: createEbayTokenProvider(ebayKeys) }));
  const counterRedis = createUpstashRedis(config);
  if (!demoMode && counterRedis) {
    const budgets: BudgetCounter[] = liveStores.map((store) => ({
      name: `Our ${STORE_NAMES[store]} budget today`,
      prefix: "budget",
      subject: store,
      limit: shopperLimits[store as keyof typeof shopperLimits] ?? 0,
    }));
    if (liveStores.includes("amazon") && amazonWarmPerDay > 0)
      budgets.push({
        name: "Our Amazon warming budget today",
        prefix: "budget-warm",
        subject: "amazon",
        limit: amazonWarmPerDay,
      });
    opsQuotas.push(createBudgetQuota({ redis: counterRedis, budgets: budgets.filter((b) => b.limit > 0) }));
  }
  const opsAlertState = createRedisOpsAlertState(redis);
  const push = webPushConfig(config);

  // Server-side only and never request-scoped: the click and price tables have no policies for visitors.
  const serviceDb =
    config.NEXT_PUBLIC_SUPABASE_URL && config.SUPABASE_SECRET_KEY
      ? createSupabaseServiceClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY)
      : null;

  return {
    userListsBackend,
    linkCodec,
    clickReport: serviceDb ? createClickReport({ stats: createSupabaseClickStats(serviceDb) }) : null,
    clickAnalytics: serviceDb
      ? createClickAnalytics({
          stats: createSupabaseClickStats(serviceDb),
          analytics: createSupabaseClickAnalytics(serviceDb),
        })
      : null,
    priceDropBoard,
    opsStore,
    recordCronRun: createRecordCronRun({ store: opsStore, logger }),
    opsAlertState,
    imageHashes,
    statusReport: createStatusReport({
      ops: opsStore,
      quotas: opsQuotas,
      stats: serviceDb ? createSupabaseOpsStats(serviceDb) : null,
      clicks: serviceDb ? createSupabaseClickStats(serviceDb) : null,
    }),
    checkOpsAlerts: createCheckOpsAlerts({
      ops: opsStore,
      quotas: opsQuotas,
      state: opsAlertState,
      sender: push ? createWebPushSender({ ...push, logger }) : null,
      logger,
    }),
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
      stores: showcaseStores,
      imageHashes,
      logger,
    }),
    categoryPage: createCategoryPage({ cache: searchCache, stores: showcaseStores, imageHashes, logger }),
    trendingQueries: demoMode ? DEMO_TRENDING_QUERIES : TRENDING_QUERIES,
    categories: demoMode ? DEMO_CATEGORIES : CATEGORIES,
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
    cachedTranslator,
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
  // Budgets keep counting in memory while Upstash is out: they must never fail open to a flood.
  const upstashCounter = createUpstashCounterStore(config);
  const counter = upstashCounter
    ? createFailoverCounterStore({ primary: upstashCounter, logger: consoleLogger })
    : createInMemoryCounterStore();
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
  for (const group of response.groups) {
    // Each link signs what its card shows, for the click log: title, landed price, best deal.
    for (const listing of group.listings) {
      outboundLinks[listing.id] = linkCodec.encode({
        id: listing.id,
        provider: listing.provider,
        url: listing.productUrl,
        context: {
          title: listing.title,
          priceAgorot: listing.price.total.amountMinor,
          bestDeal: listing.id === group.listings[0].id,
        },
      });
    }
    // "Won't ship to Israel" listings get signed links too: the shopper may still want to look.
    for (const listing of group.unavailable) {
      outboundLinks[listing.id] = linkCodec.encode({
        id: listing.id,
        provider: listing.provider,
        url: listing.productUrl,
        context: { title: listing.title, priceAgorot: null, bestDeal: false },
      });
    }
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
/**
 * The homepage's cached-results sections. They're cached as remote entries
 * shared by every server instance ("use cache: remote"), not per instance:
 * each rebuild reads ~100 cached searches and their photo hashes from Redis,
 * and serverless instances come and go all day. Refreshed when the warm-up
 * revalidates HOME_TAG, or hourly. Empty results are kept only a few minutes,
 * so cards appear soon after the cache is first warmed.
 */
export const HOME_TAG = "home";

export interface CategoryRow {
  readonly category: Category;
  readonly cards: readonly TrendingCard[];
}

/** The homepage "Trending" cards, from cached search results only (never a store API call). */
export async function trendingCards(): Promise<TrendingCard[]> {
  "use cache: remote";
  cacheTag(HOME_TAG);
  const { trendingShowcase, trendingQueries } = getServices();
  const cards = await trendingShowcase(trendingQueries);
  if (cards.length > 0) cacheLife("hours");
  else cacheLife("minutes");
  return cards;
}

/** The homepage category rows, cached results only; a category with no cards is left out. */
export async function categoryRows(): Promise<CategoryRow[]> {
  "use cache: remote";
  cacheTag(HOME_TAG);
  const { trendingShowcase, categories } = getServices();
  const rows = await Promise.all(
    categories.map(async (category) => ({ category, cards: await trendingShowcase(category.products) })),
  );
  const filled = rows.filter((row) => row.cards.length > 0);
  if (filled.length > 0) cacheLife("hours");
  else cacheLife("minutes");
  return filled;
}

/** Photos hashed per warm run at most: bounds the cron's time as the catalogue grows. */
const MAX_PHOTOS_PER_RUN = 1_500;

/** Generic searches' photo hashes after a warm run; a failure never fails the warm-up. */
async function hashPhotos(urls: readonly string[]): Promise<number | "error"> {
  if (urls.length === 0) return 0;
  try {
    return await getServices().imageHashes.ensure([...new Set(urls)].slice(0, MAX_PHOTOS_PER_RUN));
  } catch (error) {
    consoleLogger.warn("photos: hashing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
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
  "use cache: remote";
  cacheTag(HOME_TAG);
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
    href: linkCodec.encode({
      id: drop.productId,
      provider: drop.provider,
      url: drop.productUrl,
      context: { title: drop.title, priceAgorot: drop.current.amountMinor, bestDeal: false },
    }),
  }));
  if (cards.length > 0) cacheLife("hours");
  else cacheLife("minutes");
  return cards;
}

/** Cross-store savings among the homepage's own cards (trending and categories). */
export async function savingsCards(): Promise<SavingsCard[]> {
  const [trending, rows] = await Promise.all([trendingCards(), categoryRows()]);
  return selectSavings([...trending, ...rows.flatMap((r) => r.cards)]);
}

/** Category searches warmed at once: ~60 queries finish in well under a minute. */
const CATEGORY_WARM_CONCURRENCY = 3;

/**
 * Runs the trending searches (Amazon on its rotation) and then every category
 * product on the daily stores, so the homepage has fresh cached results (cron).
 */
export async function warmTrending() {
  const { warmSearchProducts, trendingQueries, categories, trendingWarmStores, amazonWarmPerDay } =
    getServices();
  const atMs = Date.now();
  const today = israelDay(new Date(atMs));
  const observed: Observed[] = [];
  const photos: string[] = [];
  const onWarmed = (query: string, response: SearchResponse) => {
    observed.push(...observationsFrom(query, response, today));
    photos.push(...photoUrlsToHash(response));
  };
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
  const categoriesWarmed = await warmTrendingSearches(
    warmSearchProducts,
    categories.flatMap((c) => c.products),
    { daily: trendingWarmStores, rotating: [], atMs },
    { concurrency: CATEGORY_WARM_CONCURRENCY, onWarmed },
  );
  const priceHistory = await recordPrices(observed, today);
  const photosHashed = await hashPhotos(photos);
  // Category pages and the homepage sections are cached: rebuilt on their next visit (not
  // served stale), after the price drops and photo hashes they read are written.
  for (const { slug } of categories) revalidateTag(categoryTag(slug), { expire: 0 });
  revalidateTag(HOME_TAG, { expire: 0 });
  return { trending, categories: categoriesWarmed, priceHistory, photosHashed };
}

/** Runs a cron's work and records how it went (see `createRecordCronRun`). */
export function recordCronRun<T>(
  job: Parameters<Services["recordCronRun"]>[0],
  work: () => Promise<T>,
  problemsOf: (result: T) => readonly string[],
) {
  return getServices().recordCronRun(job, work, problemsOf);
}

/** Everything /internal/status shows. */
export function statusReport() {
  return getServices().statusReport();
}

/**
 * After a cron run: alerts the admin browsers about new problems or recoveries.
 * Never throws: an alerting failure is logged, and the cron still succeeds.
 */
export async function checkOpsAlerts(): Promise<OpsAlertRun | "error"> {
  try {
    return await getServices().checkOpsAlerts();
  } catch (error) {
    consoleLogger.warn("ops: alert check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/** Admin browsers that receive ops alerts (the status page's switch). */
export function opsAlertTargets() {
  return getServices().opsAlertState;
}

/** Sends a test ops alert to every admin browser; how many accepted it. */
export async function sendTestOpsAlert(): Promise<{ readonly targets: number; readonly delivered: number }> {
  const config = webPushConfig(env());
  const state = getServices().opsAlertState;
  const targets = await state.targets();
  if (!config) return { targets: targets.length, delivered: 0 };
  const sender = createWebPushSender({ ...config, logger: consoleLogger });
  let delivered = 0;
  for (const target of targets) {
    const { result } = await sender.send(target, {
      title: "OneCart ops alerts",
      body: "Test alert: this browser will hear about failed crons and empty quotas.",
      url: "/internal/status",
      tag: `ops-test-${Date.now()}`,
    });
    if (result === "sent") delivered++;
    else if (result === "expired") await state.removeTarget(target.endpoint);
  }
  return { targets: targets.length, delivered };
}

export type { PushSubscriptionKeys };

/** Cache tag of one category page's data; the warm-up revalidates it. */
export const categoryTag = (slug: string) => `category:${slug}`;

/** The categories, for routes, the sitemap and navigation. */
/** Every category's slug and name in `locale` (footer links, sitemap). */
export function categoryList(
  locale: Locale = "en",
): readonly { readonly slug: string; readonly label: string }[] {
  return getServices().categories.map((category) => ({
    slug: category.slug,
    label: categoryText(category, locale).label,
  }));
}

export interface CategoryPageData {
  readonly page: CategoryPage;
  /** Best listing id → signed /go href. */
  readonly goLinks: Readonly<Record<string, string>>;
}

/**
 * A category page's data, from cached search results only, cached as the
 * page itself: crawlers never reach Redis, let alone a store. Refreshed when
 * the warm-up revalidates its tag, or hourly if a run is missed. Null for an
 * unknown slug.
 */
export async function categoryPageData(slug: string): Promise<CategoryPageData | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(categoryTag(slug));
  const { categories, categoryPage, linkCodec } = getServices();
  const category = categoryBySlug(categories, slug);
  if (!category) return null;
  const page = await categoryPage(category);
  const goLinks: Record<string, string> = {};
  for (const { bestListing } of page.products)
    goLinks[bestListing.id] = linkCodec.encode({
      id: bestListing.id,
      provider: bestListing.provider,
      url: bestListing.productUrl,
      context: { title: bestListing.title, priceAgorot: bestListing.price.total.amountMinor, bestDeal: true },
    });
  return { page, goLinks };
}

/** The /go/[id] decision; see `createResolveOutboundLink`. */
export function resolveOutboundLink(
  id: string,
  params: Readonly<Record<string, string | undefined>>,
): Promise<Result<ResolvedOutboundLink, OutboundLinkError>> {
  return getServices().resolveOutboundLink(id, params);
}

/** Outbound clicks for the last `days` days; failures are logged here, the page just says so. */
/** The /internal/analytics dashboard's data, or why there is none. */
export async function clickAnalyticsData(): Promise<ClickDashboard | "not_configured" | "error"> {
  const analytics = getServices().clickAnalytics;
  if (!analytics) return "not_configured";
  try {
    return await analytics();
  } catch (error) {
    consoleLogger.warn("internal/analytics: load failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

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
 * All offers for a user's original search text (Hebrew or English).
 * - `cached` (default): as the results page cached them. Server Actions pass
 *   client-supplied text, so they never spend a store call or a DeepL
 *   translation: a search nobody ran finds nothing.
 * - `live`: the results page's own path, calling stores on a cache miss (the
 *   price-alert cron, behind its secret).
 * Null when every store failed, so callers don't mistake an outage for "not found".
 */
export async function offersFor(
  searchText: string,
  mode: "cached" | "live" = "cached",
): Promise<UnifiedProduct[] | null> {
  const request = parseSearchParams({ q: searchText });
  if (!request.ok) return [];
  const { searchProducts, translator, cachedTranslator } = getServices();
  const live = mode === "live";
  const { query } = await buildSearchQuery(
    request.value,
    live ? translator : cachedTranslator,
    consoleLogger,
  );
  // Include deeper store pages a shopper already loaded, without paying for new ones.
  const response = await searchProducts(
    { ...query, page: 1, pageSize: ALL_RESULTS_PAGE_SIZE },
    { deeperStorePages: "cached", cachedOnly: !live },
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
