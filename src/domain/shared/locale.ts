/**
 * The interface languages. English is the default; a user's choice travels with what
 * they subscribe to (push notifications arrive in the language they signed up in).
 */
export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
