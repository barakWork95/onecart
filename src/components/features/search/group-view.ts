import { STORE_META } from "@/components/features/store-meta";
import { withLocale } from "@/components/features/outbound-link";
import { matchSearchText } from "@/domain/matching/match-query";
import { unitPrice } from "@/domain/matching/unit-price";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { normalizeQueryText } from "@/domain/search/search-query";
import { money, type Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
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
export function outboundHref(
  links: Readonly<Record<string, string>>,
  offer: Pick<UnifiedProduct, "id" | "productUrl">,
  locale: Locale = "en",
): string {
  const signed = links[offer.id];
  return signed ? withLocale(signed, locale) : offer.productUrl;
}

/** Offers listed by name on a card before "+N more"; the compare sheet has them all. */
const CARD_OFFER_LIMIT = 3;

export interface StoreComparison {
  /** "Available on 2 stores", "Compared on 2 stores", "20 listings on eBay" */
  readonly headline: string;
  /** "Amazon ₪244 vs eBay from ₪276 (3 listings)", cheapest store first. */
  readonly prices: string;
  /** "Best deal on Amazon", "Only eBay ships it to Israel"; null when one store is all there is. */
  readonly bestDeal: string | null;
}

/** How many listings each store has in the group. */
export function listingsPerStore(group: ProductGroup): ReadonlyMap<ProviderId, number> {
  const counts = new Map<ProviderId, number>();
  for (const listing of group.listings) counts.set(listing.provider, (counts.get(listing.provider) ?? 0) + 1);
  return counts;
}

/** "eBay ₪1,012" for one listing, "eBay from ₪1,012 (17 listings)" for several. */
function storePrice(offer: UnifiedProduct, listings: number, locale: Locale): string {
  const t = dict(locale).group.comparison;
  const name = STORE_META[offer.provider].name;
  const price = formatMoney(offer.price.total, { locale });
  return listings > 1 ? t.storeFrom(name, price, listings) : t.storePrice(name, price);
}

/**
 * The card's comparison summary, or null for a single listing that no other
 * store was found listing. A store that lists the product but won't ship it
 * to Israel is part of the comparison: that's worth knowing.
 */
export function storeComparison(group: ProductGroup, locale: Locale = "en"): StoreComparison | null {
  const t = dict(locale).group.comparison;
  const priced = group.offers.length;
  const counts = listingsPerStore(group);
  const best = bestOffer(group);
  const bestStore = STORE_META[best.provider].name;

  if (priced === 1 && group.unavailable.length === 0) {
    const listings = group.listings.length;
    if (listings < 2) return null;
    const dearest = group.listings[listings - 1] ?? best;
    return {
      headline: t.listingsOn(listings, bestStore),
      prices: t.fromTo(
        formatMoney(best.price.total, { locale }),
        formatMoney(dearest.price.total, { locale }),
      ),
      bestDeal: null,
    };
  }

  const shown = group.offers
    .slice(0, CARD_OFFER_LIMIT)
    .map((o) => storePrice(o, counts.get(o.provider) ?? 1, locale));
  const hidden = priced - CARD_OFFER_LIMIT;
  const unshipped = group.unavailable.map((u) => t.noOffer(STORE_META[u.provider].name));
  return {
    headline: priced >= 2 ? t.availableOn(priced) : t.comparedOn(priced + group.unavailable.length),
    prices: [shown.join(t.versus) + (hidden > 0 ? t.more(hidden) : ""), ...unshipped].join(t.versus),
    bestDeal: priced >= 2 ? t.bestDeal(bestStore) : t.onlyShips(bestStore),
  };
}

/** Stores on the card's comparison (priced plus "won't ship"), and whether there's a sheet to open. */
export function comparisonScope(group: ProductGroup): {
  stores: number;
  listings: number;
  hasSheet: boolean;
} {
  const stores = group.offers.length + group.unavailable.length;
  const listings = group.listings.length;
  return { stores, listings, hasSheet: stores > 1 || listings > 1 };
}

export interface FindMatchesLink {
  readonly href: string;
  /** "Find on eBay" or "Find on other stores" */
  readonly label: string;
}

/**
 * A focused search for a single-store item, so its twin at another store can
 * turn up and group with it. Null when every other connected store is already
 * accounted for (including one that won't ship it), or when the focused
 * search is the one already on screen.
 */
export function findMatchesLink(
  group: ProductGroup,
  connectedStores: readonly ProviderId[],
  currentQuery: string,
  locale: Locale = "en",
): FindMatchesLink | null {
  const t = dict(locale).group;
  const known = new Set([...group.offers, ...group.unavailable].map((o) => o.provider));
  const others = connectedStores.filter((store) => !known.has(store));
  const text = matchSearchText(group.title);
  if (others.length === 0 || !text || normalizeQueryText(text) === normalizeQueryText(currentQuery))
    return null;
  const [only] = others;
  return {
    href: localizedPath(locale, `/search?${new URLSearchParams({ q: text }).toString()}`),
    label: only && others.length === 1 ? t.findOn(STORE_META[only].name) : t.findOnOthers,
  };
}

/**
 * The card's claim about a multi-store group, never stronger than the
 * evidence: a model number is the same item; a photo match (generic items)
 * only looks identical; title similarity alone is a similar item.
 */
export function matchLabel(matchedBy: ProductGroup["matchedBy"], locale: Locale = "en"): string {
  const t = dict(locale).group;
  if (matchedBy === "visual_match") return t.looksIdentical;
  return matchedBy === "title_similarity" ? t.similarItem : t.sameItem;
}

/**
 * The badge on a photo-matched card: the listings look like one item, and the
 * price shown is the cheapest of them.
 */
export const LOOK_ALIKE_BADGE = dict("en").group.lookAlikeBadge;

/** Sellers named in a caveat before "and N more". */
const CAVEAT_SELLER_LIMIT = 3;

/**
 * The compare sheet's caveat for weaker matches; null when there is none. A
 * photo match names its sellers: they're different businesses selling what
 * looks like the same item.
 */
export function matchCaveat(group: ProductGroup, locale: Locale = "en"): string | null {
  const t = dict(locale).group.caveat;
  if (group.lookAlike) {
    const sellers = [...new Set(group.listings.flatMap((l) => (l.sellerName ? [l.sellerName] : [])))];
    const named = sellers.slice(0, CAVEAT_SELLER_LIMIT).join(", ");
    const more = sellers.length - CAVEAT_SELLER_LIMIT;
    const by = sellers.length > 1 ? (more > 0 ? t.moreSellers(named, more) : named) : "";
    return t.photo(by);
  }
  return group.matchedBy === "title_similarity" ? t.title : null;
}

/** "₪3.20 per piece" for a stated multi-pack; null otherwise. */
export function unitPriceLabel(
  offer: Pick<UnifiedProduct, "title" | "price">,
  locale: Locale = "en",
): string | null {
  const unit = unitPrice(offer.title, offer.price.total);
  return unit ? dict(locale).group.perPiece(formatMoney(unit.perUnit, { precise: true, locale })) : null;
}
