import type { Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/** ISO-8601 timestamp string (UTC). Kept as a string so products serialize cleanly to Redis and RSC payloads. */
export type IsoDateTime = string;

/**
 * Everything the shopper actually pays to get the item delivered to Israel,
 * normalized to the display currency (ILS). `total` is the sort key.
 */
export interface LandedPrice {
  /** Item price as listed, converted to ILS. */
  readonly item: Money;
  /** ₪0 when free — or when unknown; check `shippingKnown` before showing "free shipping". */
  readonly shipping: Money;
  /**
   * false when the provider didn't quote shipping to Israel (e.g. AliExpress
   * product search). `total` then excludes shipping and the UI must say so.
   */
  readonly shippingKnown: boolean;
  /** Israeli VAT on the import (0 when under the personal-import exemption threshold). */
  readonly importVat: Money;
  /** Customs/purchase tax (0 when under the duty exemption threshold). */
  readonly customsDuty: Money;
  /** Clearance/handling fees charged by the carrier or platform. */
  readonly fees: Money;
  /** item + shipping + importVat + customsDuty + fees. The sort key. */
  readonly total: Money;
  /**
   * true when the provider already collects taxes at checkout (e.g. Amazon's
   * "import fees deposit"), so `importVat`/`customsDuty` are exact, not estimated.
   */
  readonly taxesCollectedAtCheckout: boolean;
  /** Price as originally quoted by the provider, before FX conversion. */
  readonly listed: Money;
  /** FX rate used for listed → ILS (ILS per 1 unit of `listed.currency`). 1 when already ILS. */
  readonly fxRate: number;
}

export interface DeliveryEstimate {
  /** Business days, inclusive range. null when the provider doesn't say. */
  readonly minDays: number | null;
  readonly maxDays: number | null;
  /** null when the provider doesn't say. */
  readonly isFreeShipping: boolean | null;
  /** Provider's own label, e.g. "AliExpress Standard Shipping". */
  readonly methodLabel: string | null;
}

export interface ProductRating {
  /** 0–5 inclusive. */
  readonly average: number;
  readonly count: number;
}

export type Availability = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

/**
 * The single normalized shape every provider adapter must produce.
 * UI, sorting, caching, and the deal feed only ever see this type —
 * never a provider's raw payload.
 */
export interface UnifiedProduct {
  /** Globally unique and stable: `${provider}:${providerProductId}`. */
  readonly id: string;
  readonly provider: ProviderId;
  /** The provider's own identifier (ASIN, AliExpress item id, eBay item id…). */
  readonly providerProductId: string;
  /** Title as shown to the user (English, trimmed, no SEO keyword stuffing removal yet). */
  readonly title: string;
  readonly imageUrl: string | null;
  /**
   * Canonical product URL WITHOUT affiliate tags. Affiliate wrapping happens
   * only at redirect time (`/go/[id]`) so tags never leak into cache or analytics.
   */
  readonly productUrl: string;
  readonly price: LandedPrice;
  /** Pre-discount price in ILS, when the provider shows a strike-through price. */
  readonly originalPrice: Money | null;
  readonly rating: ProductRating | null;
  readonly delivery: DeliveryEstimate;
  readonly availability: Availability;
  readonly sellerName: string | null;
  readonly fetchedAt: IsoDateTime;
}

export function unifiedProductId(provider: ProviderId, providerProductId: string): string {
  return `${provider}:${providerProductId}`;
}
