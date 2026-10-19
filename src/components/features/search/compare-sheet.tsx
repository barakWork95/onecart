"use client";

import { ArrowRightLeft, ChevronDown, X } from "lucide-react";
import { Fragment } from "react";
import {
  comparisonScope,
  fastestOfferId,
  matchCaveat,
  outboundHref,
  premiumOverBest,
  unitPriceLabel,
} from "@/components/features/search/group-view";
import { StoreChip } from "@/components/features/search/store-chip";
import { TrackedOutboundLink } from "@/components/features/tracked-outbound-link";
import { STORE_META } from "@/components/features/store-meta";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { formatDeliveryDays, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { analyticsTitle, priceIls, trackEvent } from "@/lib/analytics";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";

function shippingLabel(offer: UnifiedProduct, locale: Locale): string {
  const t = dict(locale).compare;
  if (!offer.price.shippingKnown) return t.shippingNotQuoted;
  return offer.price.shipping.amountMinor === 0
    ? t.freeShipping
    : t.shipping(formatMoney(offer.price.shipping, { locale }));
}

/** Plain-language "where does the total come from" line. */
function breakdown(offer: UnifiedProduct, locale: Locale): string {
  const t = dict(locale).compare.breakdown;
  const precise = (m: UnifiedProduct["price"]["item"]) => formatMoney(m, { precise: true, locale });
  const { item, importVat, customsDuty, fees, taxesCollectedAtCheckout, shippingKnown } = offer.price;
  const parts = [t.item(precise(item))];
  if (shippingKnown && offer.price.shipping.amountMinor > 0)
    parts.push(t.shipping(precise(offer.price.shipping)));
  const taxes = importVat.amountMinor + customsDuty.amountMinor;
  if (taxes > 0) {
    const amount = precise({ amountMinor: taxes, currency: "ILS" });
    parts.push(taxesCollectedAtCheckout ? t.importFees(amount) : t.vatAndDuty(amount));
  } else {
    parts.push(t.noImportTax);
  }
  if (fees.amountMinor > 0) parts.push(t.clearance(precise(fees)));
  return parts.join(" · ");
}

function OfferRow({
  group,
  offer,
  index,
  fastestId,
  href,
  locale,
}: {
  group: ProductGroup;
  offer: UnifiedProduct;
  index: number;
  fastestId: string | null;
  href: string;
  locale: Locale;
}) {
  const t = dict(locale).compare;
  const isBest = index === 0;
  const meta = STORE_META[offer.provider];
  const delivery = formatDeliveryDays(offer.delivery, locale);
  const premium = premiumOverBest(group, offer);

  return (
    <li className="py-4" aria-label={t.offer(meta.name)}>
      <div className="flex items-center gap-3">
        <StoreChip provider={offer.provider} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{meta.name}</span>
            {isBest && (
              <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-success-foreground uppercase">
                {t.bestPrice}
              </span>
            )}
            {offer.id === fastestId && (
              <span className="rounded border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                {t.fastest}
              </span>
            )}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {[delivery ?? t.deliveryUnknown, shippingLabel(offer, locale)].join(" • ")}
          </p>
        </div>
        <div className="text-end">
          <p className="text-lg font-bold text-foreground">{formatMoney(offer.price.total, { locale })}</p>
          <p className="text-[11px] whitespace-nowrap text-muted-foreground">
            {isBest
              ? offer.price.shippingKnown
                ? t.totalLanded
                : t.plusShipping
              : t.vsBest(formatMoney(premium, { locale }))}
          </p>
        </div>
        <TrackedOutboundLink
          href={href}
          click={{
            store: offer.provider,
            product_title: offer.title,
            price_ils: priceIls(offer.price.total),
            is_best_deal: isBest,
            locale,
          }}
          aria-label={t.goTo(meta.name, formatMoney(offer.price.total, { locale }))}
          className={cn(
            buttonVariants({ variant: isBest ? "default" : "secondary", size: "lg" }),
            "h-11 min-w-11 rounded-xl px-4 font-semibold",
          )}
        >
          {t.go}
        </TrackedOutboundLink>
      </div>
      <p className="mt-1.5 ps-14 text-[11px] leading-snug text-muted-foreground">
        {[breakdown(offer, locale), unitPriceLabel(offer, locale)].filter(Boolean).join(" · ")}
      </p>
    </li>
  );
}

/** A store that lists the product but has no offer that ships it to Israel. */
function UnavailableRow({
  listing,
  href,
  locale,
}: {
  listing: UnavailableListing;
  href: string;
  locale: Locale;
}) {
  const t = dict(locale).compare;
  const meta = STORE_META[listing.provider];
  return (
    <li className="py-4" aria-label={t.unavailableLabel(meta.name)}>
      <div className="flex items-center gap-3">
        <StoreChip provider={listing.provider} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{meta.name}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t.unavailableBody}</p>
        </div>
        <a
          href={href}
          {...OUTBOUND_LINK}
          aria-label={t.viewLabel(meta.name)}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-11 min-w-11 rounded-xl px-4 font-semibold",
          )}
        >
          {t.view}
        </a>
      </div>
    </li>
  );
}

/**
 * Every listing a store has of this product (sellers, colours, bundles), as an
 * expandable tray under the store's best offer. Collapsed by default: the
 * cheapest is already compared above.
 */
function ListingsTray({
  provider,
  listings,
  links,
  locale,
  bestId,
}: {
  provider: UnifiedProduct["provider"];
  listings: readonly UnifiedProduct[];
  links: Readonly<Record<string, string>>;
  locale: Locale;
  /** The group's cheapest listing: the one a click counts as the best deal. */
  bestId: string;
}) {
  const t = dict(locale).compare;
  const name = STORE_META[provider].name;
  return (
    <li className="pb-3">
      <details className="group/tray rounded-2xl bg-secondary/60 open:bg-secondary">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          <span>{t.trayAll(listings.length, name)}</span>
          <ChevronDown className="size-4 transition-transform group-open/tray:rotate-180" aria-hidden />
        </summary>
        <ul className="divide-y divide-border/70 px-3 pb-2" aria-label={t.trayList(name)}>
          {listings.map((listing) => (
            <li key={listing.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                {/* Store titles keep their own direction (English inside a Hebrew page). */}
                <p dir="auto" className="line-clamp-2 text-xs leading-snug text-foreground rtl:text-right">
                  {listing.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {[
                    listing.sellerName && t.soldBy(listing.sellerName),
                    formatDeliveryDays(listing.delivery, locale),
                    shippingLabel(listing, locale),
                    unitPriceLabel(listing, locale),
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-foreground">
                {formatMoney(listing.price.total, { locale })}
              </p>
              <TrackedOutboundLink
                href={outboundHref(links, listing)}
                click={{
                  store: listing.provider,
                  product_title: listing.title,
                  price_ils: priceIls(listing.price.total),
                  is_best_deal: listing.id === bestId,
                  locale,
                }}
                aria-label={t.goToListing(name, formatMoney(listing.price.total, { locale }), listing.title)}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "h-11 min-w-11 shrink-0 rounded-lg px-3",
                )}
              >
                {t.go}
              </TrackedOutboundLink>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** "Compare (n)" button that opens the per-store landed-price breakdown as a bottom sheet. */
export function CompareSheet({
  group,
  links,
  locale = "en",
}: {
  group: ProductGroup;
  links: Readonly<Record<string, string>>;
  locale?: Locale;
}) {
  const t = dict(locale).compare;
  const fastestId = fastestOfferId(group);
  const { stores: storeCount, listings: listingCount } = comparisonScope(group);
  const singleStore = storeCount === 1;
  const storeName = STORE_META[bestOffer(group).provider].name;

  return (
    <Drawer
      onOpenChange={(open) => {
        if (open)
          trackEvent("view_comparison", {
            product_title: analyticsTitle(group.title),
            store_count: group.offers.length,
            locale,
          });
      }}
    >
      <DrawerTrigger
        className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-xl px-4 font-semibold")}
        aria-label={
          singleStore
            ? t.triggerListingsLabel(listingCount, storeName, group.title)
            : t.triggerCompareLabel(storeCount, group.title)
        }
      >
        <ArrowRightLeft className="size-4" aria-hidden />
        {singleStore ? t.triggerListings(listingCount) : t.triggerCompare(storeCount)}
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-2xl rounded-t-3xl">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
        <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-widest text-primary uppercase">
                {t.heading}{" "}
                <span className="ms-2 font-medium tracking-normal text-muted-foreground normal-case">
                  {t.deliveryToIsrael}
                </span>
              </p>
              {/* Seller titles run long; two lines on phones keep the offers above the fold. */}
              <DrawerTitle
                className="mt-1 line-clamp-2 text-xl font-bold text-foreground sm:line-clamp-none"
                title={group.title}
              >
                {singleStore
                  ? t.titleListings(listingCount, storeName, group.title)
                  : t.titleCompare(storeCount, group.title)}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-sm text-muted-foreground">
                {t.description}
                {matchCaveat(group, locale)}
              </DrawerDescription>
            </div>
            <DrawerClose
              aria-label={t.close}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <X className="size-4" aria-hidden />
            </DrawerClose>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {group.offers.map((offer, index) => {
              const listings = group.listings.filter((l) => l.provider === offer.provider);
              return (
                <Fragment key={offer.id}>
                  <OfferRow
                    group={group}
                    offer={offer}
                    index={index}
                    fastestId={fastestId}
                    href={outboundHref(links, offer)}
                    locale={locale}
                  />
                  {listings.length > 1 && (
                    <ListingsTray
                      provider={offer.provider}
                      listings={listings}
                      links={links}
                      locale={locale}
                      bestId={bestOffer(group).id}
                    />
                  )}
                </Fragment>
              );
            })}
            {group.unavailable.map((listing) => (
              <UnavailableRow
                key={listing.id}
                listing={listing}
                href={outboundHref(links, listing)}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
