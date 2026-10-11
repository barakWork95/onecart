import { BadgeCheck, Globe2, ShieldCheck } from "lucide-react";
import { PopularSearches } from "@/components/features/search/popular-searches";
import { SearchBox } from "@/components/features/search/search-box";

const VALUE_PROPS = [
  { icon: Globe2, title: "One search, four stores", body: "Amazon, AliExpress, Temu and eBay side by side." },
  {
    icon: BadgeCheck,
    title: "The real price to Israel",
    body: "Shipping, import VAT and duty added before we sort.",
  },
  { icon: ShieldCheck, title: "Buy where you trust", body: "We send you to the store's own checkout." },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pt-10 pb-8">
      <div className="flex flex-col gap-6">
        <h1 className="text-center text-4xl font-bold tracking-tight text-brand-navy">
          Find the best price.
        </h1>
        <SearchBox />
      </div>
      <PopularSearches heading="Popular searches" />
      <ul className="grid gap-3 sm:grid-cols-3">
        {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-3xl border border-border/60 bg-card p-4">
            <Icon className="size-6 text-primary" aria-hidden />
            <h2 className="mt-2 font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
