"use client";

import { ArrowRightLeft, Bookmark, Compass, TrendingDown, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly label: string;
  readonly icon: LucideIcon;
  /** null = not built yet; rendered disabled rather than as a dead link. */
  readonly href: string | null;
}

const ITEMS: readonly NavItem[] = [
  { label: "Discover", icon: Compass, href: "/" },
  { label: "Compare", icon: ArrowRightLeft, href: "/search" },
  { label: "Saved", icon: Bookmark, href: "/saved" },
  { label: "Alerts", icon: TrendingDown, href: "/alerts" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid h-16 max-w-2xl grid-cols-4">
        {ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
          const content = (
            <>
              <Icon className="size-5" aria-hidden />
              <span className="text-[11px] font-medium">{label}</span>
            </>
          );
          return (
            <li key={label} className="flex">
              {href ? (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title={`${label} — coming soon`}
                  className="flex flex-1 cursor-not-allowed flex-col items-center justify-center gap-1 text-muted-foreground/50"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
