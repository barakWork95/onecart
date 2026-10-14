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
