import type { Metadata } from "next";
import Link from "next/link";
import { categoryList, categoryPageData } from "@/app/_composition";
import { Breadcrumbs } from "@/components/features/category/breadcrumbs";
import { ProductImage } from "@/components/features/search/product-image";
import { categoryText } from "@/domain/deals/category";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { currentLocale, getDictionary, pageAlternates } from "@/i18n/server";
import type { CategoryPage } from "@/application/deals/category-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).category;
  return {
    title: t.indexTitle,
    description: t.indexDescription,
    alternates: await pageAlternates("/c"),
  };
}

/** Branded products first, then everyday gadgets matched by photo. */
const SECTIONS = [
  { mode: "branded", heading: "brandedHeading", blurb: "brandedBlurb" },
  { mode: "generic", heading: "genericHeading", blurb: "genericBlurb" },
] as const;

function CategoryTile({ page: { category, products }, locale }: { page: CategoryPage; locale: Locale }) {
  const text = categoryText(category, locale);
  return (
    <Link
      href={localizedPath(locale, `/c/${category.slug}`)}
      className="flex h-full flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md"
    >
      <span className="text-lg font-bold text-foreground">{text.label}</span>
      <span className="text-sm text-muted-foreground">{text.description}</span>
      {products.length > 0 && (
        <span className="grid grid-cols-4 gap-2" aria-hidden>
          {products.slice(0, 4).map((p) => (
            <span key={p.query} className="relative aspect-square overflow-hidden rounded-xl bg-white">
              <ProductImage src={p.imageUrl} sizes="96px" className="p-2" />
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/** Every category with a peek at its products (cached data only, like the pages themselves). */
export default async function CategoriesIndex() {
  const locale = await currentLocale();
  const t = dict(locale).category;
  const entries = await Promise.all(categoryList().map(({ slug }) => categoryPageData(slug)));
  const pages = entries.flatMap((e) => (e ? [e.page] : []));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-6 pb-10">
      <Breadcrumbs
        label={t.breadcrumb}
        crumbs={[{ label: t.home, href: localizedPath(locale, "/") }, { label: t.categories }]}
      />
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy">{t.categories}</h1>
      {SECTIONS.map(({ mode, heading, blurb }) => {
        const inSection = pages.filter((p) => p.category.mode === mode);
        if (inSection.length === 0) return null;
        return (
          <section key={mode} aria-labelledby={`section-${mode}`} className="flex flex-col gap-3">
            <div>
              <h2 id={`section-${mode}`} className="text-xl font-bold text-foreground">
                {t[heading]}
              </h2>
              <p className="text-sm text-muted-foreground">{t[blurb]}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2" aria-label={t[heading]}>
              {inSection.map((page) => (
                <li key={page.category.slug}>
                  <CategoryTile page={page} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
