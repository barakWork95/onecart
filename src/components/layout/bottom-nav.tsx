"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_ITEMS } from "@/components/layout/nav-items";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Mobile tab bar. Hidden from `md` up, where the header carries the same links. */
export function BottomNav({ locale = "en" }: { locale?: Locale } = {}) {
  const t = dict(locale).nav;
  const pathname = usePathname();

  return (
    <nav
      aria-label={t.main}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-2xl grid-cols-4">
        {NAV_ITEMS.map(({ key, icon: Icon, href }) => {
          const active = isActive(href, pathname);
          return (
            <li key={key} className="flex">
              <Link
                href={localizedPath(locale, href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[11px] font-medium">{t[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
