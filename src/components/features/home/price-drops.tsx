import { withLocale } from "@/components/features/outbound-link";
import { ExternalLink, TrendingDown } from "lucide-react";
import Link from "next/link";
import type { PriceDropCard } from "@/domain/deals/ports";
import { trendingCardId, trendingHref } from "@/components/features/home/trending-card";
import { ProductImage } from "@/components/features/search/product-image";
import { STORE_META } from "@/components/features/store-meta";
import { TrackedOutboundLink } from "@/components/features/tracked-outbound-link";
import { priceIls } from "@/lib/analytics";
import { formatMoney, formatSnapshotTime } from "@/lib/format";
import { dict, beforeValue } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";

export interface PriceDropView {
  readonly drop: PriceDropCard;
  /** Signed `/go/...` link to the listing. */
  readonly href: string;
}

const percent = (share: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);

/**
 * "Price drops": listings at a new 30-day low, well under the typical price
 * we recorded ourselves each day. Never a store's own "was" price.
 */
export function PriceDrops({ drops, locale = "en" }: { drops: readonly PriceDropView[]; locale?: Locale }) {
  if (drops.length === 0) return null;
  const t = dict(locale).home.drops;
  return (
    <section aria-labelledby="price-drops-heading" className="flex flex-col gap-4">
      <div>
        <h2
          id="price-drops-heading"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"
        >
          <TrendingDown className="size-5 text-success" aria-hidden />
          {t.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-label={t.list}>
        {drops.map(({ drop, href }) => {
          const store = STORE_META[drop.provider];
          const headingId = trendingCardId(drop.productId, "drop");
          return (
            <li key={drop.productId} className="min-w-0">
              <article
                aria-labelledby={headingId}
                className="flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm"
              >
                <div className="relative aspect-square overflow-hidden bg-white">
                  <ProductImage src={drop.imageUrl} sizes="(min-width: 1024px) 260px, 50vw" className="p-5" />
                  <span className="absolute start-2.5 top-2.5 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-success-foreground">
                    −{percent(drop.dropShare, locale)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  <h3
                    id={headingId}
                    dir="auto"
                    className="line-clamp-2 text-sm leading-snug font-bold text-foreground rtl:text-right"
                  >
                    <Link href={trendingHref(drop.query, locale)} className="hover:underline">
                      {drop.title}
                    </Link>
                  </h3>
                  <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-2xl font-extrabold tracking-tight text-foreground">
                      {formatMoney(drop.current, { locale })}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.onStore(store.name)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.typically(formatMoney(drop.typical, { locale }), drop.historyDays)}
                  </p>
                  <div className="mt-auto flex flex-col gap-1.5 pt-1">
                    <TrackedOutboundLink
                      href={withLocale(href, locale)}
                      click={{
                        store: drop.provider,
                        product_title: drop.title,
                        price_ils: priceIls(drop.current),
                        is_best_deal: false,
                        locale,
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
                    >
                      {t.view(store.name)}
                      <ExternalLink className="size-4" aria-hidden />
                    </TrackedOutboundLink>
                    <p className="text-[11px] text-muted-foreground">
                      {beforeValue(t.priceAsOf)}
                      <time dateTime={drop.observedAt}>{formatSnapshotTime(drop.observedAt, locale)}</time>
                    </p>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
