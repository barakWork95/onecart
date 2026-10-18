"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { localizedPath, splitLocale, type Locale } from "@/i18n/locales";

/** The same page in another language, query string included ("/search?q=…" → "/he/search?q=…"). */
export function switchedHref(pathname: string, search: string, to: Locale): string {
  const { path } = splitLocale(pathname);
  return `${localizedPath(to, path)}${search ? `?${search}` : ""}`;
}

/** Header link to this page in the other language, named in that language ("עברית"). */
export function LanguageSwitcher({
  to,
  text,
  label,
}: {
  to: Locale;
  /** The other language's own name. */
  text: string;
  /** Accessible name, in the current language. */
  label: string;
}) {
  const href = switchedHref(usePathname(), useSearchParams().toString(), to);
  return (
    // Not prefetched: the other language's search page would re-run the search.
    <Link
      href={href}
      prefetch={false}
      hrefLang={to}
      lang={to}
      aria-label={label}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground hover:bg-secondary"
    >
      <Languages className="size-4" aria-hidden />
      {text}
    </Link>
  );
}
