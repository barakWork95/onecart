import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";

/** `language`: the language switcher, when the page has another language. */
export function AppHeader({
  locale = "en",
  language = null,
}: { locale?: Locale; language?: ReactNode } = {}) {
  const t = dict(locale).nav;
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 md:h-16">
        <div className="flex items-center gap-8">
          <Link
            href={localizedPath(locale, "/")}
            className="flex shrink-0 items-center gap-2 rounded-lg"
            aria-label={t.home}
          >
            <Image src="/brand/onecart-icon.png" alt="" width={34} height={28} priority />
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight text-brand-navy">OneCart</span>
              <span className="block text-[11px] font-medium text-muted-foreground">{t.tagline}</span>
            </span>
          </Link>
          <DesktopNav locale={locale} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
            title={t.currencyTitle}
          >
            ₪ ILS
          </span>
          {language}
          <ThemeToggle label={t.theme} />
        </div>
      </div>
    </header>
  );
}
