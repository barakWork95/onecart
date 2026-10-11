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
    return <span className="text-xs text-muted-foreground">Shipping not quoted</span>;
  }
  const days = best.delivery.maxDays ?? best.delivery.minDays;
  if (best.delivery.isFreeShipping) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <Truck className="size-4" aria-hidden />
        Free{days !== null ? ` ${days}-day` : ""} delivery
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {group.offers.length > 1
        ? `${group.offers.length} stores from ${formatMoney(best.price.total)}`
        : STORE_META[best.provider].name}
    </span>
  );
}

/** Per-user state for the card's Save / Track buttons; null hides them (no backend configured). */
export interface CardUserState {
  readonly searchText: string;
  readonly saved: boolean;
  readonly tracking: boolean;
}

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
  const others = group.offers.slice(1);
  const nextCheapest = others[0];
  const discount = discountPercent(best);
  const storeName = STORE_META[best.provider].name;

  return (
    <article
      aria-labelledby={`${group.id}-title`}
      className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm"
    >
      <div className="flex gap-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
          {group.imageUrl ? (
            <Image src={group.imageUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <Headphones className="absolute inset-0 m-auto size-9 text-primary" aria-hidden />
          )}
          {discount !== null && (
            <span className="absolute start-1.5 top-1.5 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-success-foreground">
              -{discount}%
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-start justify-between gap-2", user && "min-h-8")}>
            {group.rating ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden />
                <span className="font-semibold text-foreground">{group.rating.average.toFixed(1)}</span>
                <span>({formatCount(group.rating.count)})</span>
                <span className="sr-only">average rating</span>
              </p>
            ) : (
              <span />
            )}
            {user && (
              <div className="-me-1 -mt-1 flex shrink-0 gap-1.5">
                <TrackPriceButton
                  productId={best.id}
                  searchText={user.searchText}
                  title={group.title}
                  currentAgorot={best.price.total.amountMinor}
                  initialTracking={user.tracking}
                />
                <SaveButton
                  productId={best.id}
                  searchText={user.searchText}
                  title={group.title}
                  initialSaved={user.saved}
                />
              </div>
            )}
          </div>
          <h2 id={`${group.id}-title`} className="truncate text-lg font-bold text-foreground">
            {group.title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Best price on {storeName}
            {nextCheapest &&
              ` • ${others.length} other ${others.length === 1 ? "store" : "stores"} from ${formatMoney(nextCheapest.price.total)}`}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-primary">{formatMoney(best.price.total)}</span>
            <span className="text-xs text-muted-foreground">
              {best.price.shippingKnown ? "total landed" : "landed + shipping"}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <DeliveryNote group={group} />
        {group.offers.length > 1 ? (
          <CompareSheet group={group} links={links} />
        ) : (
          <a
            href={outboundHref(links, best)}
            target="_blank"
            rel="nofollow sponsored noopener"
            className={cn(
              buttonVariants({ variant: "secondary", size: "lg" }),
              "h-10 rounded-xl px-4 font-semibold",
            )}
          >
            View deal {formatMoney(best.price.total)}
            <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
