import { SlidersHorizontal, Star, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { SearchSort } from "@/domain/search/search-query";
import { cn } from "@/lib/utils";

const SORTS: readonly { value: SearchSort; label: string; icon: LucideIcon }[] = [
  { value: "landed_price_asc", label: "Lowest Price", icon: SlidersHorizontal },
  { value: "delivery_fastest", label: "Fastest Delivery", icon: Zap },
  { value: "rating_desc", label: "Top Rated", icon: Star },
];

/** Links, not buttons: each sort is a shareable URL and a cache hit on the server. */
export function SortChips({ text, active }: { text: string; active: SearchSort }) {
  return (
    <nav aria-label="Sort results" className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {SORTS.map(({ value, label, icon: Icon }) => {
          const isActive = value === active;
          const params = new URLSearchParams({
            q: text,
            ...(value === "landed_price_asc" ? {} : { sort: value }),
          });
          return (
            <li key={value}>
              <Link
                href={`/search?${params.toString()}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand-navy bg-brand-navy text-background"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
