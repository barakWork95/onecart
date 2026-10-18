import { SlidersHorizontal, Star, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { SearchSort } from "@/domain/search/search-query";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

const SORTS: readonly { value: Exclude<SearchSort, "relevance">; icon: LucideIcon }[] = [
  { value: "landed_price_asc", icon: SlidersHorizontal },
  { value: "delivery_fastest", icon: Zap },
  { value: "rating_desc", icon: Star },
];

/** Search URL for `text` with `sort`; relevance is the default, so it has no param. */
export function sortHref(text: string, sort: SearchSort, locale: Locale = "en"): string {
  const params = new URLSearchParams({ q: text, ...(sort === "relevance" ? {} : { sort }) });
  return localizedPath(locale, `/search?${params.toString()}`);
}

/**
 * Optional re-sorts on top of the stores' own relevance order. Tapping the
 * active chip again clears it (back to relevance). Links, not buttons: every
 * state is a shareable URL and a cache hit on the server.
 */
export function SortChips({
  text,
  active,
  locale = "en",
}: {
  text: string;
  active: SearchSort;
  locale?: Locale;
}) {
  const t = dict(locale).search.sort;
  return (
    <nav aria-label={t.label} className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {SORTS.map(({ value, icon: Icon }) => {
          const isActive = value === active;
          const label = t[value];
          return (
            <li key={value}>
              <Link
                href={sortHref(text, isActive ? "relevance" : value, locale)}
                aria-current={isActive ? "true" : undefined}
                title={isActive ? t.clear(label) : t.by(label)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand-navy bg-brand-navy text-background"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {isActive && <X className="-me-1 size-3.5 opacity-80" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
