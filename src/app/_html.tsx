import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Heebo, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme";
import { env } from "@/config/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
// Hebrew pages only (see --font-ui in globals.css); `preload: false` keeps English pages from fetching it.
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew", "latin"], preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const DEFAULT_TITLE = "OneCart — Find the best price";

/** Vercel's production and preview deployments (where /_vercel/insights is served). */
const onVercel = () => env().VERCEL_ENV === "production" || env().VERCEL_ENV === "preview";

/** Metadata every page shares, whichever root layout renders it. */
export const BASE_METADATA: Metadata = {
  // Resolves relative URLs (share images, canonical links) against the production host.
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: "%s · OneCart" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: SITE_DESCRIPTION },
  // Google Search Console ownership (public by design: it only proves we control the site).
  verification: { google: "zx9klYgnllmBGOvctmFv39iffk8k4HUr60bNS6gdhNw" },
  // Icons come from the file conventions: app/icon.svg, app/favicon.ico, app/apple-icon.png.
};

export const BASE_VIEWPORT: Viewport = { themeColor: "#1a5fe0" };

/**
 * The document every root layout renders: language and direction on <html>, the fonts,
 * and the theme script that runs before paint.
 */
export function HtmlShell({
  lang,
  dir,
  children,
}: {
  lang: string;
  dir: "ltr" | "rtl";
  children: ReactNode;
}) {
  return (
    // The theme script sets class/style on <html> before hydration; that one difference is expected.
    <html
      lang={lang}
      dir={dir}
      className={`${jakarta.variable} ${heebo.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Server-rendered inline script: runs before paint, so no theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        {/* Cookieless page-view counts (Vercel Web Analytics). Its script is served only on
            Vercel's own deployments: elsewhere (local runs, E2E) it would just 404. */}
        {onVercel() && <Analytics />}
      </body>
    </html>
  );
}
