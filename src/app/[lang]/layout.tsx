import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { categoryList } from "@/app/_composition";
import { BASE_METADATA, BASE_VIEWPORT, DEFAULT_TITLE, HtmlShell } from "@/app/_html";
import { SHARE_CARD_ALT, SHARE_CARD_SIZE } from "@/app/_share-card";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_DESCRIPTION, SITE_NAME } from "@/config/site";
import { currentLocale, getDictionary, hebrewEnabled } from "@/i18n/server";
import { LOCALE_DIR, LOCALES, OG_LOCALE } from "@/i18n/locales";

/**
 * Every language is prebuilt. Any other first segment ("/foo") reaches `currentLocale()`,
 * which calls notFound() before anything streams: a real 404 (app/global-not-found.tsx).
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...BASE_METADATA,
    // Share images come from app/opengraph-image.tsx and app/twitter-image.tsx (every page).
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      locale: OG_LOCALE[await currentLocale()],
      images: [{ url: "/opengraph-image", ...SHARE_CARD_SIZE, alt: SHARE_CARD_ALT }],
    },
    twitter: { ...BASE_METADATA.twitter, images: [{ url: "/twitter-image", alt: SHARE_CARD_ALT }] },
  };
}

export const viewport: Viewport = BASE_VIEWPORT;

export default async function LocaleLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await currentLocale();
  const dict = await getDictionary();
  const other = locale === "en" ? "he" : "en";
  return (
    <HtmlShell lang={locale} dir={LOCALE_DIR[locale]}>
      <AppHeader
        language={
          hebrewEnabled() ? (
            // Reads the query string: its own boundary, so the header stays in the static shell.
            <Suspense>
              <LanguageSwitcher to={other} text={dict.language.switchTo} label={dict.language.switchLabel} />
            </Suspense>
          ) : null
        }
      />
      {children}
      <SiteFooter categories={categoryList()} />
      <BottomNav />
    </HtmlShell>
  );
}
