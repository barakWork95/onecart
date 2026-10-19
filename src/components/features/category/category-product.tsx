import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CategoryProduct } from "@/application/deals/category-page";
import { trendingCardId, trendingHref } from "@/components/features/home/trending-card";
import { ProductImage } from "@/components/features/search/product-image";
import { STORE_META } from "@/components/features/store-meta";
import { TrackedOutboundLink } from "@/components/features/tracked-outbound-link";
import { priceIls } from "@/lib/analytics";
import { dict, beforeValue } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { formatMoney, formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A category page's product: the best landed price, what it's made of, every
 * store's price, and links to the full comparison and the store.
 */
export function CategoryProductCard({
  product,
  goHref,
  locale = "en",
}: {
  product: CategoryProduct;
  goHref: string;
  locale?: Locale;
}) {
  const t = dict(locale).category.card;
  const precise = (m: typeof product.bestListing.price.item) => formatMoney(m, { precise: true, locale });
  const { price, provider } = product.bestListing;
  const store = STORE_META[provider].name;
  const headingId = trendingCardId(product.query, "product");
  const rows: [string, string][] = [
    [t.item, precise(price.item)],
    [
      t.shippingToIsrael,
      !price.shippingKnown
        ? t.notQuoted
        : price.shipping.amountMinor === 0
          ? t.free
          : precise(price.shipping),
    ],
    [price.taxesCollectedAtCheckout ? t.vatAtCheckout : t.vatEstimated, precise(price.importVat)],
    [t.customs, precise(price.customsDuty)],
  ];
  if (price.fees.amountMinor > 0) rows.push([t.fees, precise(price.fees)]);

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm sm:flex-row"
    >
      {/* Wide and short on phones (ten of these per page), square beside the details from sm. */}
      <div className="relative aspect-[16/9] w-full shrink-0 bg-white sm:aspect-square sm:w-48">
        <ProductImage src={product.imageUrl} sizes="(min-width: 640px) 192px, 100vw" className="p-5" />
        {product.lookAlike && (
          <span className="absolute start-2.5 bottom-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-background">
            {dict(locale).group.lookAlikeBadge}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 id={headingId} className="text-lg font-bold text-foreground">
            {product.label}
          </h2>
          <p dir="auto" className="line-clamp-2 text-xs text-muted-foreground rtl:text-right">
            {product.bestListing.title}
          </p>
        </div>

        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-3xl font-extrabold tracking-tight text-foreground">
            {formatMoney(price.total, { locale })}
          </span>
          <span className="text-sm text-muted-foreground">
            {price.shippingKnown ? t.landedOn(store) : t.shippingOn(store)}
          </span>
          {product.unitPrice && (
            <span className="text-sm text-muted-foreground">
              · {dict(locale).card.perPiece(precise(product.unitPrice.perUnit))}
            </span>
          )}
        </p>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label={t.breakdownOn(store)}>
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-end tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="col-span-2 flex justify-between border-t border-border/60 pt-1 font-semibold">
            <dt>{t.total}</dt>
            <dd className="tabular-nums">{precise(price.total)}</dd>
          </div>
        </dl>

        {product.stores.length + product.unshippedStores.length > 1 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t.everyStore}>
            {product.stores.map((s) => (
              <li
                key={s.provider}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STORE_META[s.provider].chip,
                )}
              >
                {STORE_META[s.provider].name} {formatMoney(s.total, { locale })}
              </li>
            ))}
            {product.unshippedStores.map((p) => (
              <li
                key={p}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {dict(locale).card.noOffer(STORE_META[p].name)}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Live searches: never prefetched, so a crawler can't spend store quota through them. */}
          <Link
            href={trendingHref(product.query, locale)}
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent"
          >
            {t.compareEvery}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <TrackedOutboundLink
            href={goHref}
            click={{
              store: provider,
              product_title: product.bestListing.title,
              price_ils: priceIls(price.total),
              is_best_deal: true,
              locale,
            }}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground"
          >
            {t.viewOn(store)}
            <ExternalLink className="size-4" aria-hidden />
          </TrackedOutboundLink>
          <p className="text-[11px] text-muted-foreground sm:ms-auto">
            {beforeValue(t.pricesAsOf)}
            <time dateTime={product.pricesAsOf}>{formatSnapshotTime(product.pricesAsOf, locale)}</time>
          </p>
        </div>
      </div>
    </article>
  );
}
