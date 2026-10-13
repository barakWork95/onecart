import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";

/**
 * Static pages only. Search result URLs stay out: each is a live, quota-billed
 * store query, and robots.txt keeps crawlers off them (see robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
