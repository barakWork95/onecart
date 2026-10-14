import type { NextConfig } from "next";

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
  async headers() {
    return [
      {
        // Browsers must always see the newest service worker, and it may only load our own scripts.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
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
