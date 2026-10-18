import type { Metadata } from "next";
import Link from "next/link";
import { categoryList, categoryPageData } from "@/app/_composition";
import { Breadcrumbs } from "@/components/features/category/breadcrumbs";
import { ProductImage } from "@/components/features/search/product-image";
import { pageAlternates } from "@/i18n/server";
import type { CategoryPage } from "@/application/deals/category-page";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Categories: prices in Israel compared",
    description:
      "Branded electronics and everyday gadgets for the kitchen, car and desk, compared by the full price delivered to Israel.",
    alternates: await pageAlternates("/c"),
  };
}

/** Branded products first, then everyday gadgets matched by photo. */
const SECTIONS = [
  {
    mode: "branded",
    heading: "Brands and models",
    blurb: "Specific products, matched across stores by model number.",
  },
  {
    mode: "generic",
    heading: "Everyday gadgets",
    blurb: "Unbranded items many sellers list: look-alikes matched by product photo and specs.",
  },
] as const;

function CategoryTile({ page: { category, products } }: { page: CategoryPage }) {
  return (
    <Link
      href={`/c/${category.slug}`}
      className="flex h-full flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md"
    >
      <span className="text-lg font-bold text-foreground">{category.label}</span>
      <span className="text-sm text-muted-foreground">{category.description}</span>
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
  const entries = await Promise.all(categoryList().map(({ slug }) => categoryPageData(slug)));
  const pages = entries.flatMap((e) => (e ? [e.page] : []));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-6 pb-10">
      <Breadcrumbs crumbs={[{ label: "Home", href: "/" }, { label: "Categories" }]} />
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Categories</h1>
      {SECTIONS.map(({ mode, heading, blurb }) => {
        const inSection = pages.filter((p) => p.category.mode === mode);
        if (inSection.length === 0) return null;
        return (
          <section key={mode} aria-labelledby={`section-${mode}`} className="flex flex-col gap-3">
            <div>
              <h2 id={`section-${mode}`} className="text-xl font-bold text-foreground">
                {heading}
              </h2>
              <p className="text-sm text-muted-foreground">{blurb}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2" aria-label={heading}>
              {inSection.map((page) => (
                <li key={page.category.slug}>
                  <CategoryTile page={page} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
