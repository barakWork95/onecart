import { BadgeCheck, Globe2, ShieldCheck } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { trendingCards } from "@/app/_composition";
import { TrendingShowcase, TrendingShowcaseSkeleton } from "@/components/features/home/trending-showcase";
import { PopularSearches } from "@/components/features/search/popular-searches";
import { SearchBox } from "@/components/features/search/search-box";

const VALUE_PROPS = [
  {
    icon: Globe2,
    title: "Every store, one search",
    body: "Amazon, eBay and AliExpress side by side, sellers grouped per product.",
  },
  {
    icon: BadgeCheck,
    title: "The real price to Israel",
    body: "Shipping, import VAT and duty added before we compare.",
  },
  { icon: ShieldCheck, title: "Buy where you trust", body: "We send you to the store's own checkout." },
];

/** Cached comparisons only: the homepage never calls a store's API (see `trendingCards`). */
async function Trending() {
  // Cached prices and their timestamps are request-time data, never prerendered.
  await connection();
  return <TrendingShowcase cards={await trendingCards()} />;
}

export default function HomePage() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 via-primary/5 to-background">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-10 pb-8 sm:pt-14">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">
              Find the best price.
            </h1>
            <p className="text-base text-muted-foreground">
              Compare Amazon, eBay and AliExpress by the price you&apos;ll actually pay in Israel.
            </p>
          </div>
          <SearchBox />
          <PopularSearches heading="Trending searches" />
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-8 pb-10">
        <Suspense fallback={<TrendingShowcaseSkeleton />}>
          <Trending />
        </Suspense>

        <ul className="grid gap-3 sm:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-3xl border border-border/60 bg-card p-4">
              <Icon className="size-6 text-primary" aria-hidden />
              <h2 className="mt-2 font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
