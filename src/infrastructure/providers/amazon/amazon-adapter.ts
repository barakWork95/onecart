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
import { mapAmazonProduct } from "@/infrastructure/providers/amazon/amazon-mapper";
import {
  amazonRawProductSchema,
  amazonSearchResponseSchema,
} from "@/infrastructure/providers/amazon/amazon-raw-schema";

export const SERPAPI_ENDPOINT = "https://serpapi.com/search";
const DEFAULT_TIMEOUT_MS = 4_000;
/** SerpApi reports "no results" as a 200 with this kind of message in `error`. */
const NO_RESULTS = /hasn't returned any results/i;

export interface AmazonProviderConfig {
  readonly apiKey: string;
  readonly importPolicy: ImportTaxPolicy;
  readonly getFxRates: () => Promise<FxRates>;
  /**
   * SerpApi `shipping_location`: limits results to items that ship to this
   * country. The value format is undocumented; "IL" must be confirmed live.
   */
  readonly shippingLocation?: string;
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

/** Amazon.com search via SerpApi's Amazon engine. */
export function createAmazonProvider(config: AmazonProviderConfig): ProductSearchProvider {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());

  return {
    id: "amazon",
    async search(query, options) {
      const params = new URLSearchParams({
        engine: "amazon",
        amazon_domain: "amazon.com",
        language: "en_US",
        k: query.normalizedText,
        shipping_location: config.shippingLocation ?? query.destination.country,
        api_key: config.apiKey,
      });
      const signal = AbortSignal.any([
        options.signal,
        AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ]);

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
        return status >= 400
          ? err(errorForStatus(status))
          : err(providerError("parse_error", "INVALID_JSON"));
      }

      const parsed = amazonSearchResponseSchema.safeParse(body);
      if (status >= 400)
        return err({
          ...errorForStatus(status),
          ...(parsed.data?.error ? { detail: parsed.data.error } : {}),
        });
      if (!parsed.success) return err(providerError("parse_error", "PARSE_ERROR", parsed.error.message));

      const { error, organic_results: rawItems = [] } = parsed.data;
      if (error && NO_RESULTS.test(error)) return ok([]);
      if (error) return err(providerError("upstream_error", "SERPAPI_ERROR", error));

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

      const products: UnifiedProduct[] = [];
      const seen = new Set<string>();
      for (const raw of rawItems) {
        const item = amazonRawProductSchema.safeParse(raw);
        const mapped = item.success ? mapAmazonProduct(item.data, ctx) : null;
        // Sponsored and organic slots often repeat the same ASIN.
        if (mapped && !seen.has(mapped.id)) {
          seen.add(mapped.id);
          products.push(mapped);
        }
      }

      if (rawItems.length > 0 && products.length === 0) {
        return err(providerError("parse_error", "ALL_ITEMS_INVALID", `${rawItems.length} items rejected`));
      }
      return ok(products);
    },
  };
}
