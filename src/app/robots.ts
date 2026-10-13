import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";

/**
 * Every /search URL is a live query to the stores' APIs: SerpApi bills each
 * one against a 250-a-month quota, and eBay rate-limits per day. Crawlers
 * following search links (popular searches, sort chips, "Load more") would
 * spend both, so they're kept to the static pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/search", "/go/", "/api/", "/saved", "/alerts", "/internal"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
