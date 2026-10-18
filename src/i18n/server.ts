import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { DICTIONARIES, type Dictionary } from "@/i18n/dictionaries";
import { hebrewEnabled } from "@/i18n/enabled";
import { alternatesFor, isLocale, type Locale } from "@/i18n/locales";

/** The page's language, from the [lang] root segment. Any Server Component may call it. */
export async function currentLocale(): Promise<Locale> {
  const value = await lang();
  if (value === undefined || !isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await currentLocale()];
}

export { hebrewEnabled };

/** Metadata `alternates` for the current page: `path` is its English path ("/c/x"). */
export async function pageAlternates(path: string) {
  return alternatesFor(await currentLocale(), path, { hebrew: hebrewEnabled() });
}
