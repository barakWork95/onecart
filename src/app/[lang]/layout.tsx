import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { categoryList } from "@/app/_composition";
import { BASE_METADATA, BASE_VIEWPORT, HtmlShell } from "@/app/_html";
import { OG_IMAGES, SHARE_CARD_ALT } from "@/app/_share-card";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LanguageSuggestion } from "@/components/layout/language-suggestion";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_NAME } from "@/config/site";
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
  const { meta } = await getDictionary();
  return {
    ...BASE_METADATA,
    title: { default: meta.title, template: "%s · OneCart" },
    description: meta.description,
    // Share images come from app/opengraph-image.tsx and app/twitter-image.tsx (every page).
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: meta.title,
      description: meta.description,
      locale: OG_LOCALE[await currentLocale()],
      images: OG_IMAGES,
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: meta.title,
      description: meta.description,
      images: [{ url: "/twitter-image", alt: SHARE_CARD_ALT }],
    },
  };
}

export const viewport: Viewport = BASE_VIEWPORT;

export default async function LocaleLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await currentLocale();
  const { language } = await getDictionary();
  const other = locale === "en" ? "he" : "en";
  const hebrew = hebrewEnabled();
  return (
    <HtmlShell lang={locale} dir={LOCALE_DIR[locale]}>
      {/* These read the query string: their own boundaries, so the shell stays static. */}
      {hebrew && locale === "en" && (
        <Suspense>
          <LanguageSuggestion
            text={language.suggestion}
            cta={language.suggestionCta}
            dismiss={language.suggestionDismiss}
          />
        </Suspense>
      )}
      <AppHeader
        locale={locale}
        language={
          hebrew ? (
            <Suspense>
              <LanguageSwitcher to={other} text={language.switchTo} label={language.switchLabel} />
            </Suspense>
          ) : null
        }
      />
      {children}
      <SiteFooter categories={categoryList()} locale={locale} />
      <BottomNav locale={locale} />
    </HtmlShell>
  );
}
