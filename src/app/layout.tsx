import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DEFAULT_TITLE = "OneCart — Find the best price";

export const metadata: Metadata = {
  // Resolves relative URLs (share images, canonical links) against the production host.
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: "%s · OneCart" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Share images come from app/opengraph-image.tsx and app/twitter-image.tsx.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_IL",
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: SITE_DESCRIPTION },
  // Icons come from the file conventions: app/icon.svg, app/favicon.ico, app/apple-icon.png.
};

export const viewport: Viewport = {
  themeColor: "#1a5fe0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets class/style on <html> before hydration; that one difference is expected.
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Server-rendered inline script: runs before paint, so no theme flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppHeader />
        {children}
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
