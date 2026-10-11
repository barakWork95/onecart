import type { UnifiedProduct } from "@/domain/product/unified-product";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { money, type Money } from "@/domain/shared/money";

/** Whole-percent discount vs. the store's strike-through price, or null. */
export function discountPercent(offer: UnifiedProduct): number | null {
  if (!offer.originalPrice) return null;
  const original = offer.originalPrice.amountMinor;
  const now = offer.price.item.amountMinor;
  if (original <= now) return null;
  return Math.round(((original - now) / original) * 100);
}

/** The offer that arrives soonest, only when it's strictly faster than every other offer. */
export function fastestOfferId(group: ProductGroup): string | null {
  const withDays = group.offers
    .map((o) => ({ id: o.id, days: o.delivery.maxDays ?? o.delivery.minDays }))
    .filter((o): o is { id: string; days: number } => o.days !== null)
    .sort((a, b) => a.days - b.days);
  const [first, second] = withDays;
  if (!first || group.offers.length < 2) return null;
  return !second || first.days < second.days ? first.id : null;
}

/** How much more an offer costs than the group's best landed total. */
export function premiumOverBest(group: ProductGroup, offer: UnifiedProduct): Money {
  return money(offer.price.total.amountMinor - bestOffer(group).price.total.amountMinor, "ILS");
}

/**
 * The signed /go link for an offer. Falls back to the clean store URL so a
 * missing entry costs us attribution, never the shopper's click.
 */
export function outboundHref(links: Readonly<Record<string, string>>, offer: UnifiedProduct): string {
  return links[offer.id] ?? offer.productUrl;
}
