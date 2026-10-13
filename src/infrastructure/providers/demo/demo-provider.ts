import { calculateLandedPrice } from "@/domain/pricing/landed-price-calculator";
import { toIls, type FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { unifiedProductId, type UnifiedProduct } from "@/domain/product/unified-product";
import type { ProductSearchProvider } from "@/domain/search/product-search-provider";
import { moneyFromMajor } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { ok } from "@/domain/shared/result";
import type { DemoListing } from "@/infrastructure/providers/demo/demo-catalog";

/** Each store's real search page, so "Go" lands somewhere meaningful in demo mode. */
const STORE_SEARCH_URL: Record<ProviderId, (q: string) => string> = {
  amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  aliexpress: (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
  temu: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`,
  ebay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
};

/** Lower-cased word stems: "Earbuds" and "earbud" both become "earbud". */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

function toProduct(
  listing: DemoListing,
  policy: ImportTaxPolicy,
  fx: FxRates,
  fetchedAt: string,
): UnifiedProduct {
  const major = (m: { amount: number; currency: DemoListing["price"]["currency"] }) =>
    moneyFromMajor(m.amount, m.currency);
  const item = major(listing.price);
  return {
    id: unifiedProductId(listing.provider, listing.sku),
    provider: listing.provider,
    providerProductId: listing.sku,
    title: listing.title,
    imageUrl: null,
    productUrl: STORE_SEARCH_URL[listing.provider](listing.title),
    price: calculateLandedPrice(
      {
        item,
        shipping: listing.shipping ? major(listing.shipping) : null,
        taxesCollectedAtCheckout: listing.taxesAtCheckout ? major(listing.taxesAtCheckout) : null,
      },
      policy,
      fx,
    ),
    originalPrice: listing.originalPrice ? toIls(major(listing.originalPrice), fx) : null,
    rating: listing.rating,
    delivery: {
      minDays: listing.deliveryDays[0],
      maxDays: listing.deliveryDays[1],
      isFreeShipping: listing.shipping ? listing.shipping.amount === 0 : null,
      methodLabel: listing.methodLabel,
    },
    availability: "in_stock",
    sellerName: listing.seller,
    fetchedAt,
  };
}

/** Small enough that the generated "usb cable" catalog spans several store pages. */
export const DEMO_STORE_PAGE_SIZE = 25;

export interface DemoProviderConfig {
  readonly provider: ProviderId;
  readonly catalog: readonly DemoListing[];
  readonly policy: ImportTaxPolicy;
  readonly fx: FxRates;
  readonly now?: () => Date;
}

/** Serves catalog listings whose title/keywords contain every word of the query. */
export function createDemoProvider(config: DemoProviderConfig): ProductSearchProvider {
  const listings = config.catalog
    .filter((l) => l.provider === config.provider)
    .map((l) => ({ listing: l, terms: new Set(stems([l.title, ...l.keywords].join(" "))) }));
  const now = config.now ?? (() => new Date());

  return {
    id: config.provider,
    // Sample data must never sit under a live store's cache key, even on a shared Redis.
    cacheScope: "demo",
    async search(query, options) {
      const wanted = stems(query.normalizedText);
      const fetchedAt = now().toISOString();
      const matches =
        wanted.length === 0 ? [] : listings.filter(({ terms }) => wanted.every((w) => terms.has(w)));
      const start = ((options.storePage ?? 1) - 1) * DEMO_STORE_PAGE_SIZE;
      const page = matches.slice(start, start + DEMO_STORE_PAGE_SIZE);
      return ok({
        products: page.map(({ listing }) => toProduct(listing, config.policy, config.fx, fetchedAt)),
        hasMore: start + DEMO_STORE_PAGE_SIZE < matches.length,
      });
    },
  };
}
