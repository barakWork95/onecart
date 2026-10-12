import "server-only";

import type { FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type {
  ProductSearchProvider,
  ProviderError,
  ProviderErrorKind,
} from "@/domain/search/product-search-provider";
import { err, ok } from "@/domain/shared/result";
import { mapEbayItem } from "@/infrastructure/providers/ebay/ebay-mapper";
import type { EbayTokenProvider } from "@/infrastructure/providers/ebay/ebay-oauth";
import {
  ebayErrorResponseSchema,
  ebayRawItemSchema,
  ebaySearchResponseSchema,
} from "@/infrastructure/providers/ebay/ebay-raw-schema";

export const EBAY_SEARCH_ENDPOINT = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_LIMIT = 50;
/** The Browse API rejects `offset + limit` past 10,000. */
const MAX_RESULTS = 10_000;
/** The Browse API truncates `q` past 100 characters; we cut it ourselves at a word boundary. */
const MAX_QUERY_LENGTH = 100;
/** eBay condition id for brand-new items — we compare new against new. */
const CONDITION_NEW = "1000";

export interface EbayProviderConfig {
  readonly tokens: EbayTokenProvider;
  readonly importPolicy: ImportTaxPolicy;
  readonly getFxRates: () => Promise<FxRates>;
  /** EPN campaign id; sent so eBay attributes API traffic to our affiliate account. */
  readonly affiliateCampaignId?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
  readonly limit?: number;
  readonly endpoint?: string;
}

function providerError(
  kind: ProviderErrorKind,
  code: string,
  detail?: string,
  retryable?: boolean,
): ProviderError {
  return {
    provider: "ebay",
    kind,
    code,
    retryable: retryable ?? (kind === "timeout" || kind === "rate_limited" || kind === "upstream_error"),
    ...(detail ? { detail } : {}),
  };
}

function truncateQuery(text: string): string {
  if (text.length <= MAX_QUERY_LENGTH) return text;
  const cut = text.slice(0, MAX_QUERY_LENGTH);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : MAX_QUERY_LENGTH);
}

/**
 * `X-EBAY-C-ENDUSERCTX`: buyer location (for shipping cost and delivery
 * estimates) and our EPN campaign. contextualLocation's own pairs must be
 * URL-encoded ("country%3DIL"), per eBay's header docs.
 */
export function endUserContext(country: string, affiliateCampaignId?: string): string {
  const location = `contextualLocation=${encodeURIComponent(`country=${country}`)}`;
  return affiliateCampaignId ? `affiliateCampaignId=${affiliateCampaignId},${location}` : location;
}

/** eBay.com search via the official Browse API. */
export function createEbayProvider(config: EbayProviderConfig): ProductSearchProvider {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  async function request(
    url: string,
    token: string,
    country: string,
    signal: AbortSignal,
  ): Promise<Response> {
    return doFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": endUserContext(country, config.affiliateCampaignId),
        "Accept-Language": "en-US",
      },
      signal,
    });
  }

  return {
    id: "ebay",
    async search(query, options) {
      const signal = AbortSignal.any([
        options.signal,
        AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ]);
      const country = query.destination.country;
      const limit = config.limit ?? DEFAULT_LIMIT;
      const offset = ((options.storePage ?? 1) - 1) * limit;
      const params = new URLSearchParams({
        q: truncateQuery(query.normalizedText),
        limit: String(limit),
        ...(offset > 0 ? { offset: String(offset) } : {}),
        filter: `buyingOptions:{FIXED_PRICE},conditionIds:{${CONDITION_NEW}},deliveryCountry:${country}`,
      });
      const url = `${config.endpoint ?? EBAY_SEARCH_ENDPOINT}?${params.toString()}`;

      let response: Response;
      try {
        let token = await config.tokens.getToken(signal);
        if (!token.ok) return err(providerError(token.error.kind, token.error.code, token.error.detail));
        response = await request(url, token.value, country, signal);
        // A token can be revoked before it expires: refresh once, then give up.
        if (response.status === 401) {
          config.tokens.invalidate();
          token = await config.tokens.getToken(signal);
          if (!token.ok) return err(providerError(token.error.kind, token.error.code, token.error.detail));
          response = await request(url, token.value, country, signal);
        }
      } catch (error) {
        if (signal.aborted) return err(providerError("timeout", "TIMEOUT"));
        return err(
          providerError("upstream_error", "NETWORK", error instanceof Error ? error.message : String(error)),
        );
      }

      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const apiError = ebayErrorResponseSchema.safeParse(body);
        const first = apiError.success ? apiError.data.errors[0] : undefined;
        const code = first ? `EBAY_${first.errorId}` : `HTTP_${response.status}`;
        if (response.status === 401 || response.status === 403)
          return err(providerError("unauthorized", code, first?.message));
        if (response.status === 429) return err(providerError("rate_limited", code, first?.message));
        // 400s are our request's fault (bad filter, bad query) — a bug, not an outage.
        if (response.status >= 400 && response.status < 500)
          return err(providerError("upstream_error", code, first?.message, false));
        return err(providerError("upstream_error", code, first?.message));
      }
      if (body === undefined) return err(providerError("parse_error", "INVALID_JSON"));

      const parsed = ebaySearchResponseSchema.safeParse(body);
      if (!parsed.success) return err(providerError("parse_error", "PARSE_ERROR", parsed.error.message));
      const rawItems = parsed.data.itemSummaries ?? [];

      let fx: FxRates;
      try {
        fx = await config.getFxRates();
      } catch (fxError) {
        // Not eBay's fault: non-retryable so the store's circuit breaker stays closed.
        return err(
          providerError(
            "upstream_error",
            "FX_UNAVAILABLE",
            fxError instanceof Error ? fxError.message : String(fxError),
            false,
          ),
        );
      }
      const fetchedAt = now();
      const ctx = { policy: config.importPolicy, fx, now: fetchedAt, fetchedAt: fetchedAt.toISOString() };

      const products: UnifiedProduct[] = [];
      let schemaFailures = 0;
      for (const raw of rawItems) {
        const item = ebayRawItemSchema.safeParse(raw);
        if (!item.success) {
          schemaFailures++;
          continue;
        }
        // The mapper may legitimately skip items (auction-only, unsupported currency).
        const mapped = mapEbayItem(item.data, ctx);
        if (mapped) products.push(mapped);
      }
      // Only a schema failure on every item signals a contract change.
      if (rawItems.length > 0 && schemaFailures === rawItems.length) {
        return err(providerError("parse_error", "ALL_ITEMS_INVALID", `${rawItems.length} items rejected`));
      }
      // `total` counts every match; the Browse API serves at most 10,000 of them.
      const total = Math.min(parsed.data.total ?? 0, MAX_RESULTS);
      return ok({ products, hasMore: offset + rawItems.length < total && rawItems.length > 0 });
    },
  };
}
