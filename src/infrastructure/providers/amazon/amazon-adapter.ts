import "server-only";

import type { FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type {
  ProductSearchProvider,
  ProviderError,
  ProviderErrorKind,
} from "@/domain/search/product-search-provider";
import { err, ok, type Result } from "@/domain/shared/result";
import { mapAmazonProduct, mapAmazonUnavailable } from "@/infrastructure/providers/amazon/amazon-mapper";
import {
  amazonRawProductSchema,
  amazonSearchResponseSchema,
} from "@/infrastructure/providers/amazon/amazon-raw-schema";

export const SERPAPI_ENDPOINT = "https://serpapi.com/search";
/** SerpApi's Amazon engine takes ~3–4s per page, so this store gets a longer deadline. */
export const AMAZON_TIMEOUT_MS = 9_000;
const DEFAULT_PAGES = 2;
const MAX_PAGES = 3;
/** SerpApi reports "no results" as a 200 with this kind of message in `error`. */
const NO_RESULTS = /hasn't returned any results/i;

export interface AmazonProviderConfig {
  readonly apiKey: string;
  readonly importPolicy: ImportTaxPolicy;
  readonly getFxRates: () => Promise<FxRates>;
  /**
   * SerpApi `shipping_location`: restricts offers to ones that ship there.
   * Confirmed live: "IL" works, and items with no Israel offer come back
   * unpriced ("See options" / `no_featured_offers`).
   */
  readonly shippingLocation?: string;
  /**
   * Result pages fetched in parallel per (uncached) query — each costs one
   * SerpApi credit. With shipping to Israel, most organic items are unpriced,
   * so one page yields only ~10 usable products. Clamped to 1–3.
   */
  readonly pages?: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

function providerError(kind: ProviderErrorKind, code: string, detail?: string): ProviderError {
  const retryable = kind === "timeout" || kind === "rate_limited" || kind === "upstream_error";
  return { provider: "amazon", kind, code, retryable, ...(detail ? { detail } : {}) };
}

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return providerError("unauthorized", `HTTP_${status}`);
  if (status === 429) return providerError("rate_limited", "HTTP_429");
  return providerError("upstream_error", `HTTP_${status}`);
}

/** One page's raw items, split by section; `organic` keeps Amazon's relevance order. */
interface PageItems {
  readonly organic: readonly unknown[];
  readonly featured: readonly unknown[];
  readonly hasNext: boolean;
}

/**
 * SerpApi pages behind one of our store pages. Page 1 is the first `pageCount`
 * pages fetched together (with shipping to Israel one page yields only ~10
 * priced items); every later store page is one more SerpApi page, so "Load
 * more" costs exactly one credit.
 */
export function serpApiPagesFor(storePage: number, pageCount: number): number[] {
  if (storePage <= 1) return Array.from({ length: pageCount }, (_, i) => i + 1);
  return [pageCount + storePage - 1];
}

/** Amazon.com search via SerpApi's Amazon engine. */
export function createAmazonProvider(config: AmazonProviderConfig): ProductSearchProvider {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const pageCount = Math.min(MAX_PAGES, Math.max(1, Math.floor(config.pages ?? DEFAULT_PAGES)));
  const timeoutMs = config.timeoutMs ?? AMAZON_TIMEOUT_MS;

  async function fetchPage(
    query: Parameters<ProductSearchProvider["search"]>[0],
    page: number,
    signal: AbortSignal,
  ): Promise<Result<PageItems, ProviderError>> {
    const params = new URLSearchParams({
      engine: "amazon",
      amazon_domain: "amazon.com",
      language: "en_US",
      k: query.normalizedText,
      shipping_location: config.shippingLocation ?? query.destination.country,
      ...(page > 1 ? { page: String(page) } : {}),
      api_key: config.apiKey,
    });

    let text: string;
    let status: number;
    try {
      const response = await doFetch(`${config.endpoint ?? SERPAPI_ENDPOINT}?${params.toString()}`, {
        signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      if (signal.aborted) return err(providerError("timeout", "TIMEOUT"));
      return err(
        providerError("upstream_error", "NETWORK", error instanceof Error ? error.message : String(error)),
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return status >= 400 ? err(errorForStatus(status)) : err(providerError("parse_error", "INVALID_JSON"));
    }

    const parsed = amazonSearchResponseSchema.safeParse(body);
    if (status >= 400)
      return err({ ...errorForStatus(status), ...(parsed.data?.error ? { detail: parsed.data.error } : {}) });
    if (!parsed.success) return err(providerError("parse_error", "PARSE_ERROR", parsed.error.message));

    const {
      error,
      organic_results: organic = [],
      featured_products: sections = [],
      serpapi_pagination: pagination,
    } = parsed.data;
    if (error && NO_RESULTS.test(error)) return ok({ organic: [], featured: [], hasNext: false });
    if (error) return err(providerError("upstream_error", "SERPAPI_ERROR", error));
    // Confirmed live: `serpapi_pagination.next` is present exactly when Amazon has another page.
    // Without it we assume none, so a malformed page never costs a credit on "Load more".
    const hasNext = pagination?.next !== undefined;
    return ok({ organic, featured: sections.flatMap((s) => s.products ?? []), hasNext });
  }

  return {
    id: "amazon",
    timeoutMs,
    async search(query, options) {
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
      // Pages in parallel: one round trip (~3–4s) instead of one per page.
      const pages = await Promise.all(
        serpApiPagesFor(options.storePage ?? 1, pageCount).map((page) => fetchPage(query, page, signal)),
      );
      // The first page decides success; later pages are a bonus and may fail quietly.
      const first = pages[0];
      if (!first || !first.ok) return first ?? err(providerError("upstream_error", "NO_PAGES"));
      const fetched = pages.flatMap((p) => (p.ok ? [p.value] : []));
      const hasMore = fetched[fetched.length - 1]?.hasNext ?? false;

      let fx: FxRates;
      try {
        fx = await config.getFxRates();
      } catch (fxError) {
        // Not Amazon's fault: non-retryable so the store's circuit breaker stays closed.
        return err({
          ...providerError(
            "upstream_error",
            "FX_UNAVAILABLE",
            fxError instanceof Error ? fxError.message : String(fxError),
          ),
          retryable: false,
        });
      }
      const fetchedAt = now();
      const ctx = { policy: config.importPolicy, fx, now: fetchedAt, fetchedAt: fetchedAt.toISOString() };

      // Amazon's relevance order: organic results page by page, then the carousels.
      const rawItems = [...fetched.flatMap((p) => p.organic), ...fetched.flatMap((p) => p.featured)];
      const products: UnifiedProduct[] = [];
      const unavailable: UnavailableListing[] = [];
      const seen = new Set<string>();
      let schemaFailures = 0;
      for (const raw of rawItems) {
        const item = amazonRawProductSchema.safeParse(raw);
        if (!item.success) {
          schemaFailures++;
          continue;
        }
        // Unpriced items (no offer that ships to Israel) aren't offers; they're kept as
        // "Amazon won't ship this" listings so a comparison can say so.
        const mapped = mapAmazonProduct(item.data, ctx);
        const missing = mapped ? null : mapAmazonUnavailable(item.data);
        const id = mapped?.id ?? missing?.id;
        // Organic, sponsored and carousel slots often repeat the same ASIN.
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (mapped) products.push(mapped);
        else if (missing) unavailable.push(missing);
      }

      // Only a schema failure on every item signals a contract change.
      if (rawItems.length > 0 && schemaFailures === rawItems.length) {
        return err(providerError("parse_error", "ALL_ITEMS_INVALID", `${rawItems.length} items rejected`));
      }
      return ok({ products, hasMore, unavailable });
    },
  };
}
