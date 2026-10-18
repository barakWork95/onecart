import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { TrendingCardView } from "@/components/features/home/trending-card";
import { Skeleton } from "@/components/ui/skeleton";

export interface CategoryRowView {
  readonly category: { readonly slug: string; readonly label: string; readonly searchQuery: string };
  readonly cards: readonly TrendingCard[];
}

/** Phones scroll a row sideways (cards snap); from `lg` it's a five-column grid. */
const ROW =
  "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0";
const ITEM = "w-[46%] min-w-0 shrink-0 snap-start sm:w-[31%] lg:w-auto";

/**
 * Homepage category rows: one comparison card per product, from cached
 * results only. Rows without a card are left out by the caller.
 */
export function CategoryRows({ rows }: { rows: readonly CategoryRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-8">
      {rows.map(({ category, cards }) => {
        const headingId = `category-${category.slug}`;
        return (
          <section key={category.slug} aria-labelledby={headingId} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={headingId} className="text-xl font-bold tracking-tight text-foreground">
                {category.label}
              </h2>
              {/* The category's own page: cached, indexable, and free (no store calls). */}
              <Link
                href={`/c/${category.slug}`}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                See all<span className="sr-only"> {category.label.toLowerCase()}</span>
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
            <ol className={ROW} aria-label={`${category.label} products`}>
              {cards.map((card) => (
                <li key={card.query} className={ITEM}>
                  <TrendingCardView card={card} idPrefix="category" />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function CategoryRowsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-7 w-40 rounded-xl" />
      <div className={ROW}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={`${ITEM} aspect-[3/4] rounded-3xl`} />
        ))}
      </div>
    </div>
  );
}
