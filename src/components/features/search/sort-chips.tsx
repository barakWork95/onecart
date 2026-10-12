import { SlidersHorizontal, Star, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { SearchSort } from "@/domain/search/search-query";
import { cn } from "@/lib/utils";

const SORTS: readonly { value: Exclude<SearchSort, "relevance">; label: string; icon: LucideIcon }[] = [
  { value: "landed_price_asc", label: "Lowest Price", icon: SlidersHorizontal },
  { value: "delivery_fastest", label: "Fastest Delivery", icon: Zap },
  { value: "rating_desc", label: "Top Rated", icon: Star },
];

/** Search URL for `text` with `sort`; relevance is the default, so it has no param. */
export function sortHref(text: string, sort: SearchSort): string {
  const params = new URLSearchParams({ q: text, ...(sort === "relevance" ? {} : { sort }) });
  return `/search?${params.toString()}`;
}

/**
 * Optional re-sorts on top of the stores' own relevance order. Tapping the
 * active chip again clears it (back to relevance). Links, not buttons: every
 * state is a shareable URL and a cache hit on the server.
 */
export function SortChips({ text, active }: { text: string; active: SearchSort }) {
  return (
    <nav aria-label="Sort results" className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {SORTS.map(({ value, label, icon: Icon }) => {
          const isActive = value === active;
          return (
            <li key={value}>
              <Link
                href={sortHref(text, isActive ? "relevance" : value)}
                aria-current={isActive ? "true" : undefined}
                title={isActive ? `Clear "${label}" — back to best match` : `Sort by ${label.toLowerCase()}`}
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
