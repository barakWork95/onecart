import type { NextConfig } from "next";

import { securityHeaderRules } from "./src/app/_security-headers";

/**
 * English pages keep their unprefixed URLs: "/c/x" is served by app/[lang] as "/en/c/x".
 * Listed explicitly so /api, /go, /internal, assets and metadata files never match.
 */
const ENGLISH_PAGES = ["/", "/c", "/c/:slug", "/search", "/saved", "/alerts", "/privacy", "/terms"];

const nextConfig: NextConfig = {
  images: {
    // Provider image CDNs (see CLAUDE.md → "Onboarding a new provider").
    remotePatterns: [
      { protocol: "https", hostname: "*.alicdn.com" },
      // Live product.query photos (2026-10-14): ae-pic-a1.aliexpress-media.com.
      { protocol: "https", hostname: "*.aliexpress-media.com" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "i.ebayimg.com" },
    ],
  },
  cacheComponents: true,
  experimental: {
    // Pages sit under app/[lang] (no top-level root layout): unmatched URLs need a global 404.
    globalNotFound: true,
  },
  async rewrites() {
    return {
      beforeFiles: ENGLISH_PAGES.map((source) => ({
        source,
        destination: source === "/" ? "/en" : `/en${source}`,
      })),
    };
  },
  async redirects() {
    // One URL per English page: "/en/…" is internal only.
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
      // English-only pages (ENGLISH_ONLY_PAGES): temporary, so a translation can take the URL later.
      { source: "/he/privacy", destination: "/privacy", permanent: false },
      { source: "/he/terms", destination: "/terms", permanent: false },
    ];
  },
  async headers() {
    return securityHeaderRules({ dev: process.env.NODE_ENV !== "production" });
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
