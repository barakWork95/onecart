import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CategoryProduct } from "@/application/deals/category-page";
import { trendingCardId, trendingHref } from "@/components/features/home/trending-card";
import { LOOK_ALIKE_BADGE } from "@/components/features/search/group-view";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";
import { ProductImage } from "@/components/features/search/product-image";
import { STORE_META } from "@/components/features/store-meta";
import { formatMoney, formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A category page's product: the best landed price, what it's made of, every
 * store's price, and links to the full comparison and the store.
 */
export function CategoryProductCard({ product, goHref }: { product: CategoryProduct; goHref: string }) {
  const { price, provider } = product.bestListing;
  const store = STORE_META[provider].name;
  const headingId = trendingCardId(product.query, "product");
  const rows: [string, string][] = [
    ["Item", formatMoney(price.item, { precise: true })],
    [
      "Shipping to Israel",
      !price.shippingKnown
        ? "Not quoted"
        : price.shipping.amountMinor === 0
          ? "Free"
          : formatMoney(price.shipping, { precise: true }),
    ],
    [
      price.taxesCollectedAtCheckout ? "Import VAT (charged at checkout)" : "Import VAT (estimated)",
      formatMoney(price.importVat, { precise: true }),
    ],
    ["Customs duty", formatMoney(price.customsDuty, { precise: true })],
  ];
  if (price.fees.amountMinor > 0) rows.push(["Fees", formatMoney(price.fees, { precise: true })]);

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
            {LOOK_ALIKE_BADGE}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 id={headingId} className="text-lg font-bold text-foreground">
            {product.label}
          </h2>
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.bestListing.title}</p>
        </div>

        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-3xl font-extrabold tracking-tight text-foreground">
            {formatMoney(price.total)}
          </span>
          <span className="text-sm text-muted-foreground">
            {price.shippingKnown ? "landed" : "+ shipping"} on {store}
          </span>
          {product.unitPrice && (
            <span className="text-sm text-muted-foreground">
              · {formatMoney(product.unitPrice.perUnit, { precise: true })} per piece
            </span>
          )}
        </p>

        <dl
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm"
          aria-label={`Price breakdown on ${store}`}
        >
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-end tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="col-span-2 flex justify-between border-t border-border/60 pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(price.total, { precise: true })}</dd>
          </div>
        </dl>

        {product.stores.length + product.unshippedStores.length > 1 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Every store">
            {product.stores.map((s) => (
              <li
                key={s.provider}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STORE_META[s.provider].chip,
                )}
              >
                {STORE_META[s.provider].name} {formatMoney(s.total)}
              </li>
            ))}
            {product.unshippedStores.map((p) => (
              <li
                key={p}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {STORE_META[p].name}: no offer to Israel
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Live searches: never prefetched, so a crawler can't spend store quota through them. */}
          <Link
            href={trendingHref(product.query)}
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent"
          >
            Compare every store
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <a
            href={goHref}
            {...OUTBOUND_LINK}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground"
          >
            View on {store}
            <ExternalLink className="size-4" aria-hidden />
          </a>
          <p className="text-[11px] text-muted-foreground sm:ms-auto">
            Prices as of <time dateTime={product.pricesAsOf}>{formatSnapshotTime(product.pricesAsOf)}</time>
          </p>
        </div>
      </div>
    </article>
  );
}
