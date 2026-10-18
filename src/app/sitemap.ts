import type { MetadataRoute } from "next";
import { categoryList, categoryPageData } from "@/app/_composition";
import { SITE_URL } from "@/config/site";
import { hebrewEnabled } from "@/i18n/enabled";
import { alternatesFor, LOCALES, type Locale } from "@/i18n/locales";

type Entry = MetadataRoute.Sitemap[number];

/**
 * Pages built from cached data only. Search result URLs stay out: each is a
 * live, quota-billed store query, and robots.txt keeps crawlers off them (see
 * robots.ts). A category page is listed once it's indexable (enough products).
 * With Hebrew live, every page is listed in each language, linked to the others.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await Promise.all(categoryList().map(({ slug }) => categoryPageData(slug)));
  const paths: [string, Entry["changeFrequency"], number][] = [
    ["/", "daily", 1],
    ["/c", "weekly", 0.6],
    ...pages.flatMap((data): [string, Entry["changeFrequency"], number][] =>
      data?.page.indexable ? [[`/c/${data.page.category.slug}`, "daily", 0.8]] : [],
    ),
    ["/privacy", "yearly", 0.2],
    ["/terms", "yearly", 0.2],
  ];
  const hebrew = hebrewEnabled();
  const locales: readonly Locale[] = hebrew ? LOCALES : ["en"];
  return locales.flatMap((locale) =>
    paths.map(([path, changeFrequency, priority]): Entry => {
      const { canonical, languages } = alternatesFor(locale, path, { hebrew });
      return {
        url: `${SITE_URL}${canonical}`,
        changeFrequency,
        priority,
        ...(languages
          ? {
              alternates: {
                languages: Object.fromEntries(
                  Object.entries(languages).map(([lang, href]) => [lang, `${SITE_URL}${href}`]),
                ),
              },
            }
          : {}),
      };
    }),
  );
}
