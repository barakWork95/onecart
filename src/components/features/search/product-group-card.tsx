import { ArrowRight, ExternalLink, Search, Star, Truck } from "lucide-react";
import Link from "next/link";
import { CompareSheet } from "@/components/features/search/compare-sheet";
import { ProductImage } from "@/components/features/search/product-image";
import {
  comparisonScope,
  discountPercent,
  matchLabel,
  outboundHref,
  storeComparison,
  unitPriceLabel,
  type FindMatchesLink,
} from "@/components/features/search/group-view";
import { STORE_META } from "@/components/features/store-meta";
import { SaveButton } from "@/components/features/user-lists/save-button";
import { TrackPriceButton } from "@/components/features/user-lists/track-price-button";
import { buttonVariants } from "@/components/ui/button";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import type { ProviderId } from "@/domain/shared/provider";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { formatCount, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";

function DeliveryNote({ group, locale }: { group: ProductGroup; locale: Locale }) {
  const t = dict(locale).group;
  const best = bestOffer(group);
  if (!best.price.shippingKnown) {
    return <p className="text-xs text-muted-foreground">{t.shippingNotQuoted}</p>;
  }
  if (!best.delivery.isFreeShipping) return null;
  const days = best.delivery.maxDays ?? best.delivery.minDays;
  return (
    <p className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <Truck className="size-3.5 shrink-0" aria-hidden />
      {t.freeDelivery(days)}
    </p>
  );
}

/** Per-user state for the card's Save / Track buttons; null hides them (no backend configured). */
export interface CardUserState {
  readonly searchText: string;
  readonly saved: boolean;
  readonly tracking: boolean;
}

/** "Available on 2 stores: Amazon ₪244 vs eBay ₪276 — best deal on Amazon", over three lines. */
function StoreComparisonNote({ group, locale }: { group: ProductGroup; locale: Locale }) {
  const comparison = storeComparison(group, locale);
  if (!comparison) return null;
  return (
    <p className="text-xs leading-relaxed">
      <span className="block font-semibold text-primary">
        {comparison.headline}
        <span className="sr-only">:</span>
      </span>{" "}
      <span className="block text-muted-foreground">{comparison.prices}</span>{" "}
      {comparison.bestDeal && (
        <span className="block font-semibold text-success">
          <span className="sr-only">— </span>
          {comparison.bestDeal}
        </span>
      )}
    </p>
  );
}

/**
 * One product (grouped across stores) as a grid tile: a large square image,
 * then title and landed price as the two things the eye lands on.
 */
export function ProductGroupCard({
  group,
  links,
  user = null,
  findMatches = null,
  checkStore = null,
  locale = "en",
}: {
  group: ProductGroup;
  locale?: Locale;
  links: Readonly<Record<string, string>>;
  user?: CardUserState | null;
  /** Single-store cards: a focused search that may find the item at another store. */
  findMatches?: FindMatchesLink | null;
  /** A store that's down, with a signed link to search its own site for this item. */
  checkStore?: { readonly provider: ProviderId; readonly href: string } | null;
}) {
  const best = bestOffer(group);
  const storeCount = group.offers.length;
  const discount = discountPercent(best);
  const storeName = STORE_META[best.provider].name;
  const t = dict(locale);
  const label = matchLabel(group.matchedBy, locale);
  const perPiece = unitPriceLabel(best, locale);

  return (
    <article
      aria-labelledby={`${group.id}-title`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      {/* White in both themes: store photos (Amazon especially) are shot on white, so the tile blends in. */}
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={group.imageUrl}
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 50vw"
          className="p-4 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        {discount !== null && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-success-foreground">
            -{discount}%
          </span>
        )}
        {group.lookAlike && (
          <span className="absolute start-2.5 bottom-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-background">
            {t.group.lookAlikeBadge}
          </span>
        )}
        {user && (
          <div className="absolute end-2.5 top-2.5 flex flex-col gap-1.5">
            <SaveButton
              productId={best.id}
              searchText={user.searchText}
              title={group.title}
              initialSaved={user.saved}
              locale={locale}
              overlay
            />
            <TrackPriceButton
              productId={best.id}
              searchText={user.searchText}
              title={group.title}
              currentAgorot={best.price.total.amountMinor}
              initialTracking={user.tracking}
              locale={locale}
              overlay
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {storeCount > 1
              ? `${label} · ${t.group.stores(storeCount)}`
              : group.listings.length > 1
                ? `${storeName} · ${t.group.listings(group.listings.length)}`
                : storeName}
          </span>
        </p>
        <h2
          id={`${group.id}-title`}
          dir="auto"
          className="line-clamp-2 text-sm leading-snug font-semibold text-foreground sm:text-base rtl:text-right"
          title={group.title}
        >
          {group.title}
        </h2>
        {group.rating && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden />
            <span className="font-semibold text-foreground">{group.rating.average.toFixed(1)}</span>
            <span>({formatCount(group.rating.count, locale)})</span>
            <span className="sr-only">{t.group.averageRating}</span>
          </p>
        )}

        <div className="mt-auto flex flex-col gap-1 pt-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[1.7rem]">
              {formatMoney(best.price.total, { locale })}
            </span>
            <span className="text-xs text-muted-foreground">
              {best.price.shippingKnown ? t.group.totalLanded : t.group.plusShipping}
            </span>
          </p>
          {perPiece && <p className="text-xs font-medium text-muted-foreground">{perPiece}</p>}
          <DeliveryNote group={group} locale={locale} />
          <StoreComparisonNote group={group} locale={locale} />
        </div>

        <div className="pt-2 [&>*]:w-full">
          {comparisonScope(group).hasSheet ? (
            <CompareSheet group={group} links={links} locale={locale} />
          ) : (
            <a
              href={outboundHref(links, best)}
              {...OUTBOUND_LINK}
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "h-11 rounded-xl px-3 font-semibold",
              )}
            >
              {t.group.viewDeal(formatMoney(best.price.total, { locale }))}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </a>
          )}
          {storeCount === 1 && checkStore && (
            // The store's API is down: send the shopper to its own search, via our affiliate redirect.
            <a
              href={checkStore.href}
              {...OUTBOUND_LINK}
              aria-label={t.group.checkLabel(STORE_META[checkStore.provider].name, group.title)}
              className="mt-1.5 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-secondary"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {t.group.check(STORE_META[checkStore.provider].name)}
            </a>
          )}
          {storeCount === 1 && findMatches && (
            // Not prefetched: the focused search can cost a store API call.
            <Link
              href={findMatches.href}
              prefetch={false}
              aria-label={t.group.findLabel(findMatches.label, group.title)}
              className="mt-1.5 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-secondary"
            >
              <Search className="size-3.5" aria-hidden />
              {findMatches.label}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
