import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/features/search/product-image";
import { STORE_META } from "@/components/features/store-meta";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { formatMoney, formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A valid element id for a card: ids can't contain spaces, and
 * `aria-labelledby` splits on them ("airpods pro" would name two elements).
 */
export function trendingCardId(query: string): string {
  return `trending-${query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function trendingHref(query: string): string {
  return `/search?${new URLSearchParams({ q: query }).toString()}`;
}

/**
 * One trending product as a compact comparison: the best landed price, each
 * store's price (or that it won't ship to Israel), and when the prices were
 * checked. The whole card opens the full comparison.
 */
export function TrendingCardView({ card }: { card: TrendingCard }) {
  const bestStore = STORE_META[card.best.provider].name;
  const headingId = trendingCardId(card.query);
  // Stores with a price; "won't ship to Israel" is shown in the store chips, not counted here.
  const storeCount = card.stores.length;
  return (
    <article
      aria-labelledby={headingId}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={card.imageUrl}
          sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 50vw"
          className="p-5 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        {storeCount > 1 && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-background">
            {storeCount} stores
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <h3
          id={headingId}
          className="text-sm leading-snug font-bold text-foreground sm:text-base"
        >
          {/* The heading's link covers the whole card: one tab stop, one click target. */}
          <Link href={trendingHref(card.query)} className="after:absolute after:inset-0 focus:outline-none">
            {card.label}
          </Link>
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="text-2xl font-extrabold tracking-tight text-foreground">
            {formatMoney(card.best.total)}
          </span>
          <span className="text-xs text-muted-foreground">on {bestStore}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Stores">
          {card.stores.map((store) => (
            <li
              key={store.provider}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                STORE_META[store.provider].chip,
              )}
            >
              {STORE_META[store.provider].name} {formatMoney(store.total)}
              {store.listings > 1 && (
                <span className="font-medium opacity-80">· {store.listings} listings</span>
              )}
            </li>
          ))}
          {card.unshippedStores.map((provider) => (
            <li
              key={provider}
              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {STORE_META[provider].name}: no offer to Israel
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            Prices as of <time dateTime={card.pricesAsOf}>{formatSnapshotTime(card.pricesAsOf)}</time>
          </p>
          <ArrowRight
            className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
            aria-hidden
          />
        </div>
      </div>
    </article>
  );
}
