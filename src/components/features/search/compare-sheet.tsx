"use client";

import { ArrowRightLeft, X } from "lucide-react";
import { fastestOfferId, outboundHref, premiumOverBest } from "@/components/features/search/group-view";
import { StoreChip } from "@/components/features/search/store-chip";
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
import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProductGroup } from "@/domain/search/product-group";
import { formatDeliveryDays, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function shippingLabel(offer: UnifiedProduct): string {
  if (!offer.price.shippingKnown) return "Shipping not quoted";
  return offer.price.shipping.amountMinor === 0
    ? "Free shipping"
    : `${formatMoney(offer.price.shipping)} shipping`;
}

/** Plain-language "where does the total come from" line. */
function breakdown(offer: UnifiedProduct): string {
  const { item, importVat, customsDuty, fees, taxesCollectedAtCheckout, shippingKnown } = offer.price;
  const parts = [`Item ${formatMoney(item, { precise: true })}`];
  if (shippingKnown && offer.price.shipping.amountMinor > 0)
    parts.push(`shipping ${formatMoney(offer.price.shipping, { precise: true })}`);
  const taxes = importVat.amountMinor + customsDuty.amountMinor;
  if (taxes > 0) {
    parts.push(
      `${taxesCollectedAtCheckout ? "import fees" : "est. VAT & duty"} ${formatMoney({ amountMinor: taxes, currency: "ILS" }, { precise: true })}`,
    );
  } else {
    parts.push("no import tax");
  }
  if (fees.amountMinor > 0) parts.push(`clearance ${formatMoney(fees, { precise: true })}`);
  return parts.join(" · ");
}

function OfferRow({
  group,
  offer,
  index,
  fastestId,
  href,
}: {
  group: ProductGroup;
  offer: UnifiedProduct;
  index: number;
  fastestId: string | null;
  href: string;
}) {
  const isBest = index === 0;
  const meta = STORE_META[offer.provider];
  const delivery = formatDeliveryDays(offer.delivery);
  const premium = premiumOverBest(group, offer);

  return (
    <li className="py-4" aria-label={`${meta.name} offer`}>
      <div className="flex items-center gap-3">
        <StoreChip provider={offer.provider} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{meta.name}</span>
            {isBest && (
              <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-success-foreground uppercase">
                Best price
              </span>
            )}
            {offer.id === fastestId && (
              <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                Fastest
              </span>
            )}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {[delivery ?? "Delivery time not quoted", shippingLabel(offer)].join(" • ")}
          </p>
        </div>
        <div className="text-end">
          <p className="text-lg font-bold text-foreground">{formatMoney(offer.price.total)}</p>
          <p className="text-[11px] whitespace-nowrap text-muted-foreground">
            {isBest
              ? offer.price.shippingKnown
                ? "Total landed"
                : "+ shipping"
              : `+${formatMoney(premium)} vs best`}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="nofollow sponsored noopener"
          aria-label={`Go to ${meta.name} — ${formatMoney(offer.price.total)}`}
          className={cn(
            buttonVariants({ variant: isBest ? "default" : "secondary", size: "lg" }),
            "h-10 rounded-xl px-4 font-semibold",
          )}
        >
          Go
        </a>
      </div>
      <p className="mt-1.5 ps-14 text-[11px] leading-snug text-muted-foreground/80">{breakdown(offer)}</p>
    </li>
  );
}

/** "Compare (n)" button that opens the per-store landed-price breakdown as a bottom sheet. */
export function CompareSheet({
  group,
  links,
}: {
  group: ProductGroup;
  links: Readonly<Record<string, string>>;
}) {
  const fastestId = fastestOfferId(group);
  const storeCount = group.offers.length;

  return (
    <Drawer>
      <DrawerTrigger
        className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-xl px-4 font-semibold")}
        aria-label={`Compare ${storeCount} stores for ${group.title}`}
      >
        <ArrowRightLeft className="size-4" aria-hidden />
        Compare ({storeCount})
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-2xl rounded-t-3xl">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
        <div className="overflow-y-auto px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-widest text-primary uppercase">
                Landed breakdown{" "}
                <span className="ms-2 font-medium tracking-normal text-muted-foreground normal-case">
                  Delivery to Israel
                </span>
              </p>
              <DrawerTitle className="mt-1 text-xl font-bold text-foreground">
                Compare {storeCount} stores: {group.title}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-sm text-muted-foreground">
                Shipping, estimated import VAT and duty included where stores quote them.
                {group.matchedBy === "title_similarity" &&
                  " Matched by similar titles — check the listing before buying."}
              </DrawerDescription>
            </div>
            <DrawerClose
              aria-label="Close comparison"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <X className="size-4" aria-hidden />
            </DrawerClose>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {group.offers.map((offer, index) => (
              <OfferRow
                key={offer.id}
                group={group}
                offer={offer}
                index={index}
                fastestId={fastestId}
                href={outboundHref(links, offer)}
              />
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
