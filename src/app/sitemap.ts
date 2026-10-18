import type { MetadataRoute } from "next";
import { categoryList, categoryPageData } from "@/app/_composition";
import { SITE_URL } from "@/config/site";

/**
 * Pages built from cached data only. Search result URLs stay out: each is a
 * live, quota-billed store query, and robots.txt keeps crawlers off them (see
 * robots.ts). A category page is listed once it's indexable (enough products).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await Promise.all(categoryList().map(({ slug }) => categoryPageData(slug)));
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/c`, changeFrequency: "weekly", priority: 0.6 },
    ...pages.flatMap((data) =>
      data?.page.indexable
        ? [
            {
              url: `${SITE_URL}/c/${data.page.category.slug}`,
              changeFrequency: "daily" as const,
              priority: 0.8,
            },
          ]
        : [],
    ),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
