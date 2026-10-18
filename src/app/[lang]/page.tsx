import { BadgeCheck, Globe2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { categoryRows, priceDropCards, savingsCards, trendingCards } from "@/app/_composition";
import { PriceDrops } from "@/components/features/home/price-drops";
import { Savings } from "@/components/features/home/savings";
import { CategoryRows, CategoryRowsSkeleton } from "@/components/features/home/category-rows";
import { TrendingShowcase, TrendingShowcaseSkeleton } from "@/components/features/home/trending-showcase";
import { PopularSearches } from "@/components/features/search/popular-searches";
import { SearchBox } from "@/components/features/search/search-box";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { currentLocale, pageAlternates } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: await pageAlternates("/") };
}

const VALUE_PROPS = [
  { icon: Globe2, key: "stores" },
  { icon: BadgeCheck, key: "landed" },
  { icon: ShieldCheck, key: "trust" },
] as const;

/** Cached comparisons only: the homepage never calls a store's API (see `trendingCards`). */
async function Trending({ locale }: { locale: Locale }) {
  // Cached prices and their timestamps are request-time data, never prerendered.
  await connection();
  return <TrendingShowcase cards={await trendingCards()} locale={locale} />;
}

/** Same item clearly cheaper on one store: from the cached cards below. */
async function CrossStoreSavings({ locale }: { locale: Locale }) {
  await connection();
  return <Savings savings={await savingsCards()} locale={locale} />;
}

/** Real drops against our own daily price history, left in the cache by the cron. */
async function Drops({ locale }: { locale: Locale }) {
  await connection();
  return <PriceDrops drops={await priceDropCards()} locale={locale} />;
}

/** Category rows: cached results only, like the trending grid. */
async function Categories({ locale }: { locale: Locale }) {
  await connection();
  return <CategoryRows rows={await categoryRows()} locale={locale} />;
}

export default async function HomePage() {
  const locale = await currentLocale();
  const t = dict(locale).home;
  return (
    <main className="flex w-full flex-1 flex-col">
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 via-primary/5 to-background">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-10 pb-8 sm:pt-14">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">{t.title}</h1>
            <p className="text-base text-muted-foreground">{t.subtitle}</p>
          </div>
          <SearchBox locale={locale} />
          <PopularSearches heading={t.trendingSearches} locale={locale} />
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-8 pb-10">
        {/* Hidden until they have something true to show: no skeletons. */}
        <Suspense fallback={null}>
          <CrossStoreSavings locale={locale} />
        </Suspense>

        <Suspense fallback={<TrendingShowcaseSkeleton />}>
          <Trending locale={locale} />
        </Suspense>

        <Suspense fallback={null}>
          <Drops locale={locale} />
        </Suspense>

        <Suspense fallback={<CategoryRowsSkeleton />}>
          <Categories locale={locale} />
        </Suspense>

        <ul className="grid gap-3 sm:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, key }) => (
            <li key={key} className="rounded-3xl border border-border/60 bg-card p-4">
              <Icon className="size-6 text-primary" aria-hidden />
              <h2 className="mt-2 font-bold text-foreground">{t.valueProps[key].title}</h2>
              <p className="text-sm text-muted-foreground">{t.valueProps[key].body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
