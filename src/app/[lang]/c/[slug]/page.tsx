import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryList, categoryPageData } from "@/app/_composition";
import { JsonLd } from "@/app/_json-ld";
import { OG_IMAGES } from "@/app/_share-card";
import { Breadcrumbs } from "@/components/features/category/breadcrumbs";
import { CategoryProductCard } from "@/components/features/category/category-product";
import { HowWePrice } from "@/components/features/category/how-we-price";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { SITE_URL } from "@/config/site";
import { pageAlternates } from "@/i18n/server";
import { formatSnapshotTime } from "@/lib/format";

/** Every category is prebuilt; its data refreshes with the warm-up (see `categoryPageData`). */
export async function generateStaticParams() {
  return categoryList().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await categoryPageData(slug);
  if (!data) return {};
  const { category, indexable } = data.page;
  const alternates = await pageAlternates(`/c/${category.slug}`);
  return {
    title: category.seoTitle,
    description: category.description,
    alternates,
    openGraph: {
      title: category.seoTitle,
      description: category.description,
      url: alternates.canonical,
      type: "website",
      images: OG_IMAGES,
    },
    // Thin until the warm-up fills it: followed, not indexed.
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryPageRoute({ params }: PageProps<"/[lang]/c/[slug]">) {
  const { slug } = await params;
  const data = await categoryPageData(slug);
  if (!data) notFound();
  const { page, goLinks } = data;
  const { category, products, pricesAsOf } = page;
  const url = `${SITE_URL}/c/${category.slug}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-6 pb-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Categories", item: `${SITE_URL}/c` },
                { "@type": "ListItem", position: 3, name: category.label, item: url },
              ],
            },
            // Names only: our landed prices aren't the stores' own prices, so no offers here.
            {
              "@type": "ItemList",
              name: category.seoTitle,
              url,
              numberOfItems: products.length,
              itemListElement: products.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: p.label,
              })),
            },
          ],
        }}
      />
      <Breadcrumbs
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Categories", href: "/c" },
          { label: category.label },
        ]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">{category.seoTitle}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{category.intro}</p>
        {pricesAsOf && (
          <p className="text-xs text-muted-foreground">
            Prices checked daily; these as of{" "}
            <time dateTime={pricesAsOf}>{formatSnapshotTime(pricesAsOf)}</time>.
          </p>
        )}
      </header>

      {products.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Prices for this category are being checked. Please come back later today.
        </p>
      ) : (
        <ol className="flex flex-col gap-4" aria-label={`${category.label} products`}>
          {products.map((product) => (
            <li key={product.query}>
              <CategoryProductCard product={product} goHref={goLinks[product.bestListing.id] ?? "/"} />
            </li>
          ))}
        </ol>
      )}

      <HowWePrice policy={ISRAEL_IMPORT_POLICY} />
    </main>
  );
}
