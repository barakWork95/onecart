"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_ITEMS } from "@/components/layout/nav-items";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Header navigation from `md` up; replaces the mobile bottom tab bar on wide screens. */
export function DesktopNav({ locale = "en" }: { locale?: Locale } = {}) {
  const t = dict(locale).nav;
  const pathname = usePathname();

  return (
    <nav aria-label={t.main} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ key, icon: Icon, href }) => {
          const active = isActive(href, pathname);
          return (
            <li key={key}>
              <Link
                href={localizedPath(locale, href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/5 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
