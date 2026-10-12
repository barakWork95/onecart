import { STORE_META } from "@/components/features/store-meta";
import { matchSearchText } from "@/domain/matching/match-query";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { normalizeQueryText } from "@/domain/search/search-query";
import { money, type Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { formatMoney } from "@/lib/format";

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

/** Offers listed by name on a card before "+N more"; the compare sheet has them all. */
const CARD_OFFER_LIMIT = 3;

export interface StoreComparison {
  /** "Available on 2 stores" */
  readonly headline: string;
  /** "Amazon ₪244 vs eBay ₪276", cheapest first. */
  readonly prices: string;
  /** "Best deal on Amazon" */
  readonly bestDeal: string;
}

/** The card's cross-store summary, or null for a single-store group. */
export function storeComparison(group: ProductGroup): StoreComparison | null {
  if (group.offers.length < 2) return null;
  const shown = group.offers
    .slice(0, CARD_OFFER_LIMIT)
    .map((o) => `${STORE_META[o.provider].name} ${formatMoney(o.price.total)}`);
  const hidden = group.offers.length - CARD_OFFER_LIMIT;
  return {
    headline: `Available on ${group.offers.length} stores`,
    prices: shown.join(" vs ") + (hidden > 0 ? ` +${hidden} more` : ""),
    bestDeal: `Best deal on ${STORE_META[bestOffer(group).provider].name}`,
  };
}

export interface FindMatchesLink {
  readonly href: string;
  /** "Find on eBay" or "Find on other stores" */
  readonly label: string;
}

/**
 * A focused search for a single-store item, so its twin at another store can
 * turn up and group with it. Null when no other store is connected, or when
 * the focused search is the one already on screen.
 */
export function findMatchesLink(
  group: ProductGroup,
  connectedStores: readonly ProviderId[],
  currentQuery: string,
): FindMatchesLink | null {
  const best = bestOffer(group);
  const others = connectedStores.filter((store) => store !== best.provider);
  const text = matchSearchText(group.title);
  if (others.length === 0 || !text || normalizeQueryText(text) === normalizeQueryText(currentQuery))
    return null;
  const [only] = others;
  return {
    href: `/search?${new URLSearchParams({ q: text }).toString()}`,
    label: only && others.length === 1 ? `Find on ${STORE_META[only].name}` : "Find on other stores",
  };
}
