/**
 * The interface languages (defined in the domain: subscriptions carry one). English is
 * the default and keeps the unprefixed URLs Google already indexes (/c/headphones);
 * Hebrew lives under /he (/he/c/headphones).
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/domain/shared/locale";

export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@/domain/shared/locale";

export const LOCALE_DIR: Readonly<Record<Locale, "ltr" | "rtl">> = { en: "ltr", he: "rtl" };

/** Open Graph `locale`: the language as read in Israel. */
export const OG_LOCALE: Readonly<Record<Locale, string>> = { en: "en_IL", he: "he_IL" };

/**
 * The public URL path of a page in a language: "/c/x" in English, "/he/c/x" in Hebrew.
 * `path` is the English path, always starting with "/".
 */
export function localizedPath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Splits a URL path into its language and the English path: "/he/c/x" → he, "/c/x". The
 * internal English path ("/en/c/x", what `usePathname()` reports behind the rewrite) reads
 * the same as the public one; no English page's path starts with "/en".
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first = "", ...rest] = pathname.split("/");
  if (isLocale(first)) return { locale: first, path: `/${rest.join("/")}` };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** Next's `alternates`: this page's canonical URL, plus its other languages when they're live. */
export function alternatesFor(
  locale: Locale,
  path: string,
  { hebrew }: { readonly hebrew: boolean },
): { canonical: string; languages?: Record<string, string> } {
  const canonical = localizedPath(locale, path);
  if (!hebrew) return { canonical };
  return {
    canonical,
    languages: {
      en: localizedPath("en", path),
      he: localizedPath("he", path),
      "x-default": localizedPath(DEFAULT_LOCALE, path),
    },
  };
}

/**
 * Pages that exist in English only (the legal pages, until translated): the Hebrew URL
 * redirects to them (next.config.ts), and they carry no hreflang alternates.
 */
export const ENGLISH_ONLY_PAGES = ["/privacy", "/terms"] as const;
