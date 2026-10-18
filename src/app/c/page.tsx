import type { Metadata } from "next";
import Link from "next/link";
import { categoryList, categoryPageData } from "@/app/_composition";
import { Breadcrumbs } from "@/components/features/category/breadcrumbs";
import { ProductImage } from "@/components/features/search/product-image";

export const metadata: Metadata = {
  title: "Categories: prices in Israel compared",
  description:
    "Headphones, speakers, smart home, kitchen, phone accessories and gaming, compared by the full price delivered to Israel.",
  alternates: { canonical: "/c" },
};

/** Every category with a peek at its products (cached data only, like the pages themselves). */
export default async function CategoriesIndex() {
  const entries = await Promise.all(categoryList().map(({ slug }) => categoryPageData(slug)));
  const pages = entries.flatMap((e) => (e ? [e.page] : []));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-6 pb-10">
      <Breadcrumbs crumbs={[{ label: "Home", href: "/" }, { label: "Categories" }]} />
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Categories</h1>
      <ul className="grid gap-4 sm:grid-cols-2" aria-label="Categories">
        {pages.map(({ category, products }) => (
          <li key={category.slug}>
            <Link
              href={`/c/${category.slug}`}
              className="flex h-full flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md"
            >
              <span className="text-lg font-bold text-foreground">{category.label}</span>
              <span className="text-sm text-muted-foreground">{category.description}</span>
              {products.length > 0 && (
                <span className="grid grid-cols-4 gap-2" aria-hidden>
                  {products.slice(0, 4).map((p) => (
                    <span
                      key={p.query}
                      className="relative aspect-square overflow-hidden rounded-xl bg-white"
                    >
                      <ProductImage src={p.imageUrl} sizes="96px" className="p-2" />
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
