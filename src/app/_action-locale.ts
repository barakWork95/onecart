import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";

/**
 * The language a Server Action answers in: sent by the client with its input (actions
 * can't read the page's [lang] segment). Anything missing or unknown reads as English.
 */
export function localeOf(input: unknown): Locale {
  const value =
    typeof input === "object" && input !== null ? (input as { locale?: unknown }).locale : undefined;
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}
