import "server-only";

import type { FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type {
  ProductSearchProvider,
  ProviderError,
  ProviderErrorKind,
} from "@/domain/search/product-search-provider";
import type { SearchQuery } from "@/domain/search/search-query";
import { err, ok, type Result } from "@/domain/shared/result";
import { mapAliExpressProduct } from "@/infrastructure/providers/aliexpress/aliexpress-mapper";
import {
  callAliExpress,
  type AliExpressGatewayConfig,
} from "@/infrastructure/providers/aliexpress/aliexpress-gateway";
import {
  aliExpressQueryResponseSchema,
  aliExpressRawProductSchema,
} from "@/infrastructure/providers/aliexpress/aliexpress-raw-schema";

const API_METHOD = "aliexpress.affiliate.product.query";
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_PAGE_SIZE = 20;

export interface AliExpressProviderConfig extends AliExpressGatewayConfig {
  readonly trackingId?: string;
  readonly importPolicy: ImportTaxPolicy;
  readonly getFxRates: () => Promise<FxRates>;
  /** See `AliExpressMapContext.pricesIncludeImportVat`. */
  readonly pricesIncludeImportVat?: boolean;
  readonly timeoutMs?: number;
  readonly pageSize?: number;
}

function providerError(kind: ProviderErrorKind, code: string, detail?: string): ProviderError {
  const retryable = kind === "timeout" || kind === "rate_limited" || kind === "upstream_error";
  return { provider: "aliexpress", kind, code, retryable, ...(detail ? { detail } : {}) };
}

export function createAliExpressProvider(config: AliExpressProviderConfig): ProductSearchProvider {
  const now = config.now ?? (() => new Date());

  async function search(
    query: SearchQuery,
    options: { readonly signal: AbortSignal },
  ): Promise<Result<readonly UnifiedProduct[], ProviderError>> {
    const signal = AbortSignal.any([
      options.signal,
      AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    ]);

    const response = await callAliExpress(
      API_METHOD,
      {
        keywords: query.normalizedText,
        ship_to_country: query.destination.country,
        target_currency: "ILS",
        target_language: "EN",
        page_no: String(query.page),
        page_size: String(config.pageSize ?? DEFAULT_PAGE_SIZE),
        ...(config.trackingId ? { tracking_id: config.trackingId } : {}),
      },
      config,
      signal,
    );
    if (!response.ok)
      return err(providerError(response.error.kind, response.error.code, response.error.detail));
    const body = response.value;

    const envelope = aliExpressQueryResponseSchema.safeParse(body);
    if (!envelope.success) return err(providerError("parse_error", "PARSE_ERROR", envelope.error.message));

    const { resp_code, resp_msg, result } =
      envelope.data.aliexpress_affiliate_product_query_response.resp_result;
    if (resp_code !== 200) return err(providerError("upstream_error", `RESP_${resp_code}`, resp_msg));

    const rawProducts = result?.products?.product ?? [];
    let fx: FxRates;
    try {
      fx = await config.getFxRates();
    } catch (error) {
      // Not AliExpress's fault: non-retryable so the store's circuit breaker stays closed.
      return err({
        provider: "aliexpress",
        kind: "upstream_error",
        code: "FX_UNAVAILABLE",
        retryable: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    const ctx = {
      policy: config.importPolicy,
      fx,
      fetchedAt: now().toISOString(),
      pricesIncludeImportVat: config.pricesIncludeImportVat ?? false,
    };

    const products: UnifiedProduct[] = [];
    for (const raw of rawProducts) {
      const parsed = aliExpressRawProductSchema.safeParse(raw);
      const mapped = parsed.success ? mapAliExpressProduct(parsed.data, ctx) : null;
      if (mapped) products.push(mapped);
    }

    // Every item malformed means the upstream contract changed, not "no results".
    if (rawProducts.length > 0 && products.length === 0) {
      return err(providerError("parse_error", "ALL_ITEMS_INVALID", `${rawProducts.length} items rejected`));
    }
    return ok(products);
  }

  return { id: "aliexpress", search };
}
