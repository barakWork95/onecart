import { Flame } from "lucide-react";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { TrendingCardView } from "@/components/features/home/trending-card";
import { Skeleton } from "@/components/ui/skeleton";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5";

/**
 * The homepage "Trending" grid, from cards built on cached search results
 * only. Renders nothing until the cache holds at least one of the products.
 */
export function TrendingShowcase({
  cards,
  locale = "en",
}: {
  cards: readonly TrendingCard[];
  locale?: Locale;
}) {
  if (cards.length === 0) return null;
  const t = dict(locale).home.trending;
  return (
    <section aria-labelledby="trending-heading" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="trending-heading"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"
          >
            <Flame className="size-5 text-primary" aria-hidden />
            {t.heading}
          </h2>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>
      <ol className={GRID} aria-label={t.list}>
        {cards.map((card) => (
          <li key={card.query} className="min-w-0">
            <TrendingCardView card={card} locale={locale} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrendingShowcaseSkeleton() {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] w-full rounded-3xl" />
      ))}
    </div>
  );
}
