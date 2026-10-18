import { unifiedProductId, type UnifiedProduct } from "@/domain/product/unified-product";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

export interface ProductSpec {
  readonly provider?: ProviderId;
  readonly sku?: string;
  readonly title?: string;
  /** Landed total in agorot; item price equals the total (no taxes) for simplicity. */
  readonly total?: number;
  readonly rating?: { average: number; count: number } | null;
  readonly deliveryDays?: readonly [number | null, number | null];
  readonly freeShipping?: boolean | null;
  readonly imageUrl?: string | null;
  readonly sellerName?: string | null;
}

/** "anker Official Store" for an Anker/Soundcore title: the brand's own AliExpress store. */
function brandStore(title: string): string {
  const [brand] = tokenizeTitle(title).brands;
  return brand ? `${brand} Official Store` : "Official Store";
}

/** Builds a valid UnifiedProduct with only the fields a test cares about. */
export function makeProduct(spec: ProductSpec = {}): UnifiedProduct {
  const provider = spec.provider ?? "aliexpress";
  const sku = spec.sku ?? "1";
  const total = money(spec.total ?? 100_00, "ILS");
  const title = spec.title ?? `Product ${sku}`;
  const zero = money(0, "ILS");
  const [minDays, maxDays] = spec.deliveryDays ?? [null, null];
  return {
    id: unifiedProductId(provider, sku),
    provider,
    providerProductId: sku,
    title,
    imageUrl: spec.imageUrl === undefined ? `https://img.example/${sku}.jpg` : spec.imageUrl,
    productUrl: `https://${provider}.example/item/${sku}`,
    price: {
      item: total,
      shipping: zero,
      shippingKnown: true,
      importVat: zero,
      customsDuty: zero,
      fees: zero,
      total,
      taxesCollectedAtCheckout: false,
      listed: total,
      fxRate: 1,
    },
    originalPrice: null,
    rating: spec.rating === undefined ? null : spec.rating,
    delivery: { minDays, maxDays, isFreeShipping: spec.freeShipping ?? null, methodLabel: null },
    availability: "in_stock",
    // AliExpress products group across stores only from the brand's own store (see
    // `isUnverifiedBrandListing`); unless a test is about sellers, assume that store.
    sellerName:
      spec.sellerName !== undefined ? spec.sellerName : provider === "aliexpress" ? brandStore(title) : null,
    fetchedAt: "2026-10-11T09:00:00.000Z",
  };
}
