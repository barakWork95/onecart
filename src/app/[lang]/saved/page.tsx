import { withLocale } from "@/components/features/outbound-link";
import { Bookmark, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServices } from "@/app/_composition";
import { readUserLists } from "@/app/_user-lists";
import { removeSavedAction } from "@/app/[lang]/saved/actions";
import { STORE_META } from "@/components/features/store-meta";
import { TrackedOutboundLink } from "@/components/features/tracked-outbound-link";
import { priceIls } from "@/lib/analytics";
import { EmptyList, ListPage, ProductThumb } from "@/components/features/user-lists/list-page";
import { RemoveButton } from "@/components/features/user-lists/remove-button";
import { Skeleton } from "@/components/ui/skeleton";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { currentLocale, getDictionary } from "@/i18n/server";
import { formatMoney } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.savedTitle };
}

async function SavedList({ locale }: { locale: Locale }) {
  await connection();
  const t = dict(locale).saved;
  const access = await readUserLists();
  if (access.kind === "unavailable") {
    return <EmptyList icon={Bookmark} title={t.unavailableTitle} body={t.unavailableBody} locale={locale} />;
  }
  const items = access.kind === "user" ? await access.repo.listSaved() : [];
  if (items.length === 0) {
    return <EmptyList icon={Bookmark} title={t.emptyTitle} body={t.emptyBody} locale={locale} />;
  }

  const { linkCodec } = getServices();
  return (
    <ul className="flex flex-col gap-3" aria-label={t.list}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-3">
          <ProductThumb imageUrl={item.imageUrl} />
          <div className="min-w-0 flex-1">
            <h2 dir="auto" className="truncate font-semibold text-foreground rtl:text-right">
              {item.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t.whenSaved(formatMoney(item.price, { locale }), STORE_META[item.provider].name)}
            </p>
            <div className="mt-1 flex gap-3 text-sm font-semibold">
              <TrackedOutboundLink
                href={withLocale(
                  linkCodec.encode({
                    id: item.productId,
                    provider: item.provider,
                    url: item.productUrl,
                    context: { title: item.title, priceAgorot: item.price.amountMinor, bestDeal: false },
                  }),
                  locale,
                )}
                click={{
                  store: item.provider,
                  product_title: item.title,
                  price_ils: priceIls(item.price),
                  is_best_deal: false,
                  locale,
                }}
                className="text-primary"
                aria-label={t.goToStoreLabel(STORE_META[item.provider].name, item.title)}
              >
                {t.goToStore}
              </TrackedOutboundLink>
              <Link
                href={localizedPath(
                  locale,
                  `/search?${new URLSearchParams({ q: item.searchText }).toString()}`,
                )}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                {t.compareToday}
              </Link>
            </div>
          </div>
          <RemoveButton
            label={t.remove(item.title)}
            action={removeSavedAction}
            productId={item.productId}
            locale={locale}
          />
        </li>
      ))}
    </ul>
  );
}

export default async function SavedPage() {
  const locale = await currentLocale();
  const t = dict(locale).saved;
  return (
    <ListPage title={t.title} intro={t.intro}>
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-3xl" />}>
        <SavedList locale={locale} />
      </Suspense>
    </ListPage>
  );
}
