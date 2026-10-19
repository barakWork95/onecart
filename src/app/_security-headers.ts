/**
 * Security headers for every response, applied from next.config.ts `headers()`.
 *
 * CSP trade-off: Next.js inlines its hydration data and our theme script, and a
 * per-request nonce would force every page to render dynamically (no static or
 * cached shells). So scripts are limited to our own origin plus inline, with no
 * remote script hosts at all; Vercel Analytics is served from our own origin.
 */

/** Product photos load straight from the stores' CDNs (see product-image.tsx, `unoptimized`). */
const IMAGE_HOSTS = [
  "https://*.alicdn.com",
  "https://*.aliexpress-media.com",
  "https://m.media-amazon.com",
  "https://i.ebayimg.com",
];

export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_HOSTS.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Ordered: for the same key, a later rule wins. */
export function securityHeaderRules({ dev }: { dev: boolean }): HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    },
    {
      // Outbound store links never reveal which search led there.
      source: "/go/:path*",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
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
}
