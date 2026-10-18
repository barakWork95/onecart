import { en, type Dictionary } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import type { Locale } from "@/i18n/locales";

export type { Dictionary };

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { en, he };

/** A language's interface text. Components take `locale` as a prop and look their text up here. */
export function dict(locale: Locale = "en"): Dictionary {
  return DICTIONARIES[locale];
}

const LISTS = new Map<string, Intl.ListFormat>();

/** "eBay, Amazon and AliExpress" / "eBay, Amazon ו-AliExpress"; `or` for alternatives. */
export function joinList(
  items: readonly string[],
  locale: Locale = "en",
  type: "and" | "or" = "and",
): string {
  const key = `${locale}:${type}`;
  let f = LISTS.get(key);
  if (!f) {
    f = new Intl.ListFormat(locale, { style: "long", type: type === "and" ? "conjunction" : "disjunction" });
    LISTS.set(key, f);
  }
  return f.format(items);
}
