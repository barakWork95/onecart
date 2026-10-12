import { ArrowRight, Headphones, Star, Truck } from "lucide-react";
import Image from "next/image";
import { CompareSheet } from "@/components/features/search/compare-sheet";
import { discountPercent, outboundHref } from "@/components/features/search/group-view";
import { STORE_META } from "@/components/features/store-meta";
import { SaveButton } from "@/components/features/user-lists/save-button";
import { TrackPriceButton } from "@/components/features/user-lists/track-price-button";
import { buttonVariants } from "@/components/ui/button";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import { formatCount, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function DeliveryNote({ group }: { group: ProductGroup }) {
  const best = bestOffer(group);
  if (!best.price.shippingKnown) {
    return <p className="text-xs text-muted-foreground">Shipping not quoted</p>;
  }
  if (!best.delivery.isFreeShipping) return null;
  const days = best.delivery.maxDays ?? best.delivery.minDays;
  return (
    <p className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <Truck className="size-3.5 shrink-0" aria-hidden />
      Free{days !== null ? ` ${days}-day` : ""} delivery
    </p>
  );
}

/** Per-user state for the card's Save / Track buttons; null hides them (no backend configured). */
export interface CardUserState {
  readonly searchText: string;
  readonly saved: boolean;
  readonly tracking: boolean;
}

/**
 * One product (grouped across stores) as a grid tile: a large square image,
 * then title and landed price as the two things the eye lands on.
 */
export function ProductGroupCard({
  group,
  links,
  user = null,
}: {
  group: ProductGroup;
  links: Readonly<Record<string, string>>;
  user?: CardUserState | null;
}) {
  const best = bestOffer(group);
  const storeCount = group.offers.length;
  const discount = discountPercent(best);
  const storeName = STORE_META[best.provider].name;

  return (
    <article
      aria-labelledby={`${group.id}-title`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      {/* White in both themes: store photos (Amazon especially) are shot on white, so the tile blends in. */}
      <div className="relative aspect-square overflow-hidden bg-white">
        {group.imageUrl ? (
          <Image
            src={group.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 50vw"
            // Whole product visible, never cropped — like Amazon's own listings.
            className="object-contain p-4 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <Headphones className="absolute inset-0 m-auto size-16 text-primary/70" aria-hidden />
        )}
        {discount !== null && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-success-foreground">
            -{discount}%
          </span>
        )}
        {user && (
          <div className="absolute end-2.5 top-2.5 flex flex-col gap-1.5">
            <SaveButton
              productId={best.id}
              searchText={user.searchText}
              title={group.title}
              initialSaved={user.saved}
              overlay
            />
            <TrackPriceButton
              productId={best.id}
              searchText={user.searchText}
              title={group.title}
              currentAgorot={best.price.total.amountMinor}
              initialTracking={user.tracking}
              overlay
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{storeName}</span>
          {storeCount > 1 && ` · ${storeCount} stores`}
        </p>
        <h2
          id={`${group.id}-title`}
          className="line-clamp-2 text-sm leading-snug font-semibold text-foreground sm:text-base"
          title={group.title}
        >
          {group.title}
        </h2>
        {group.rating && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden />
            <span className="font-semibold text-foreground">{group.rating.average.toFixed(1)}</span>
            <span>({formatCount(group.rating.count)})</span>
            <span className="sr-only">average rating</span>
          </p>
        )}

        <div className="mt-auto flex flex-col gap-1 pt-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[1.7rem]">
              {formatMoney(best.price.total)}
            </span>
            <span className="text-xs text-muted-foreground">
              {best.price.shippingKnown ? "total landed" : "+ shipping"}
            </span>
          </p>
          <DeliveryNote group={group} />
        </div>

        <div className="pt-2 [&>*]:w-full">
          {storeCount > 1 ? (
            <CompareSheet group={group} links={links} />
          ) : (
            <a
              href={outboundHref(links, best)}
              target="_blank"
              rel="nofollow sponsored noopener"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "h-10 rounded-xl px-3 font-semibold",
              )}
            >
              View deal {formatMoney(best.price.total)}
              <ArrowRight className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
