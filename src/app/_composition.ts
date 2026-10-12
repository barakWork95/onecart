import "server-only";

import { randomBytes } from "node:crypto";
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
import { createSearchProducts, type SearchProducts } from "@/application/search/search-products";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { ebayCredentials, env } from "@/config/env";
import type { OutboundLinkCodec } from "@/domain/affiliate/ports";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProductSearchProvider } from "@/domain/search/product-search-provider";
import type { SearchResponse } from "@/domain/search/search-response";
import type { QueryTranslator } from "@/domain/search/ports";
import { PROVIDER_IDS } from "@/domain/shared/provider";
import type { Result } from "@/domain/shared/result";
import { createAffiliateLinkBuilder } from "@/infrastructure/affiliate/affiliate-link-builder";
import { consoleClickRecorder } from "@/infrastructure/affiliate/console-click-recorder";
import { createHmacOutboundLinkCodec } from "@/infrastructure/affiliate/outbound-link-codec";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { createInMemoryUserLists } from "@/infrastructure/db/in-memory-user-lists";
import { createRedisCircuitBreakerStore } from "@/infrastructure/cache/redis-circuit-breaker-store";
import { createRedisSearchCache } from "@/infrastructure/cache/redis-search-cache";
import { createUpstashRedis } from "@/infrastructure/cache/upstash";
import { createCachedFxRates } from "@/infrastructure/fx/cached-fx-rates";
import { createFrankfurterFxSource } from "@/infrastructure/fx/frankfurter-fx-source";
import { consoleLogger } from "@/infrastructure/logging/console-logger";
import { createAliExpressProvider } from "@/infrastructure/providers/aliexpress/aliexpress-adapter";
import { createAliExpressLinkGenerator } from "@/infrastructure/providers/aliexpress/aliexpress-link-generator";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
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
  readonly translator: QueryTranslator;
  readonly linkCodec: OutboundLinkCodec;
  readonly resolveOutboundLink: ReturnType<typeof createResolveOutboundLink>;
  readonly demoMode: boolean;
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
  | { readonly kind: "memory"; readonly store: ReturnType<typeof createInMemoryUserLists> }
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
  if (demoMode) {
    logger.warn("composition: demo providers enabled — results are sample data");
    for (const provider of PROVIDER_IDS) {
      providers.push(
        createDemoProvider({ provider, catalog: DEMO_CATALOG, policy: ISRAEL_IMPORT_POLICY, fx: DEMO_FX }),
      );
    }
  } else {
    const getFxRates = createCachedFxRates({ source: createFrankfurterFxSource(), store: redis, logger });
    if (config.SERPAPI_API_KEY) {
      providers.push(
        createAmazonProvider({
          apiKey: config.SERPAPI_API_KEY,
          importPolicy: ISRAEL_IMPORT_POLICY,
          getFxRates,
          pages: config.SERPAPI_AMAZON_PAGES,
        }),
      );
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
        ? { kind: "memory", store: createInMemoryUserLists() }
        : { kind: "none" };

  return {
    userListsBackend,
    linkCodec,
    resolveOutboundLink: createResolveOutboundLink({
      codec: linkCodec,
      affiliate: createAffiliateLinkBuilder({
        ...(config.AFFILIATE_AMAZON_TAG ? { amazonTag: config.AFFILIATE_AMAZON_TAG } : {}),
        ...(config.AFFILIATE_EBAY_CAMPAIGN_ID ? { ebayCampaignId: config.AFFILIATE_EBAY_CAMPAIGN_ID } : {}),
        ...(config.ALIEXPRESS_APP_KEY &&
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
      clicks: consoleClickRecorder,
      logger,
    }),
    searchProducts: createSearchProducts({
      providers,
      cache: createRedisSearchCache(redis),
      circuitBreaker: createRedisCircuitBreakerStore(redis),
      cacheTtlSeconds: config.SEARCH_CACHE_TTL_SECONDS,
      logger,
    }),
    translator,
    demoMode,
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
      /** Offer id → signed `/go/...` href for every offer on this page. */
      readonly outboundLinks: Readonly<Record<string, string>>;
    };

/** Everything the /search page needs, from raw URL params. */
export async function searchFromParams(params: RawSearchParams): Promise<SearchPageResult> {
  const request = parseSearchParams(params);
  if (!request.ok) return { kind: "no_query" };

  const { searchProducts, translator, demoMode, linkCodec } = getServices();
  const { query, translation } = await buildSearchQuery(request.value, translator, consoleLogger);
  const response = await searchProducts(query);

  const outboundLinks: Record<string, string> = {};
  for (const offer of response.groups.flatMap((g) => g.offers)) {
    outboundLinks[offer.id] = linkCodec.encode({
      id: offer.id,
      provider: offer.provider,
      url: offer.productUrl,
    });
  }
  return { kind: "results", response, translation, demoMode, outboundLinks };
}

/** The /go/[id] decision; see `createResolveOutboundLink`. */
export function resolveOutboundLink(
  id: string,
  params: Readonly<Record<string, string | undefined>>,
): Promise<Result<ResolvedOutboundLink, OutboundLinkError>> {
  return getServices().resolveOutboundLink(id, params);
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
  const response = await searchProducts({ ...query, page: 1, pageSize: ALL_RESULTS_PAGE_SIZE });
  const searched = response.providers.filter((p) => p.status !== "skipped");
  if (searched.length > 0 && searched.every((p) => ["timeout", "error", "circuit_open"].includes(p.status)))
    return null;
  return response.groups.flatMap((g) => [...g.offers]);
}

/** The product with this id in today's results for `searchText`, or null. */
export async function findOffer(productId: string, searchText: string): Promise<UnifiedProduct | null> {
  return (await offersFor(searchText))?.find((o) => o.id === productId) ?? null;
}
