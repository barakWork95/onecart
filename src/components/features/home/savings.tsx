import { Scale } from "lucide-react";
import type { SavingsCard } from "@/application/deals/savings";
import { TrendingCardView } from "@/components/features/home/trending-card";
import { STORE_META } from "@/components/features/store-meta";
import { formatMoney } from "@/lib/format";
import { money } from "@/domain/shared/money";

/** "Save ₪170 vs Amazon"; a photo match claims no more than it knows. */
export function savingClaim(s: SavingsCard): string {
  const saved = formatMoney(money(s.savedMinor, "ILS"));
  return s.card.lookAlike
    ? `Looks identical, ${saved} less on ${STORE_META[s.cheapest].name}`
    : `Save ${saved} vs ${STORE_META[s.against].name}`;
}

/**
 * "Cheaper on another store": the same item (matched by model number, or an
 * unbranded item by photo) priced clearly lower on one store than the next,
 * from the homepage's cached cards.
 */
export function Savings({ savings }: { savings: readonly SavingsCard[] }) {
  if (savings.length === 0) return null;
  return (
    <section aria-labelledby="savings-heading" className="flex flex-col gap-4">
      <div>
        <h2
          id="savings-heading"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"
        >
          <Scale className="size-5 text-primary" aria-hidden />
          Cheaper on another store
        </h2>
        <p className="text-sm text-muted-foreground">
          The same item, landed in Israel, for clearly less at one store than the next.
        </p>
      </div>
      <ol
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
        aria-label="Cross-store savings"
      >
        {savings.map((s) => (
          <li key={s.card.query} className="min-w-0">
            <TrendingCardView card={s.card} idPrefix="savings" highlight={savingClaim(s)} />
          </li>
        ))}
      </ol>
    </section>
  );
}
