import type { TrendingCard } from "@/application/deals/trending-showcase";
import type { ProviderId } from "@/domain/shared/provider";

export interface SavingsPolicy {
  readonly minSavedMinor: number;
  readonly minSavedShare: number;
}

/** Worth a headline: at least ₪20 and 10% below the next store. */
export const SAVINGS_POLICY: SavingsPolicy = { minSavedMinor: 20_00, minSavedShare: 0.1 };

export interface SavingsCard {
  readonly card: TrendingCard;
  readonly cheapest: ProviderId;
  /** The next-cheapest store, the one the saving is measured against. */
  readonly against: ProviderId;
  readonly savedMinor: number;
  readonly savedShare: number;
}

/**
 * Cards where one store is clearly cheaper than another for the same item,
 * biggest saving (₪) first. Only model-number matches count: a "similar item"
 * grouped by title alone can't back a claim that the same thing costs less.
 */
export function selectSavings(
  cards: readonly TrendingCard[],
  max = 6,
  policy: SavingsPolicy = SAVINGS_POLICY,
): SavingsCard[] {
  const seen = new Set<string>();
  const savings: SavingsCard[] = [];
  for (const card of cards) {
    if (seen.has(card.query) || card.matchedBy !== "model_number") continue;
    seen.add(card.query);
    const [first, second] = [...card.stores].sort((a, b) => a.total.amountMinor - b.total.amountMinor);
    if (!first || !second) continue;
    const savedMinor = second.total.amountMinor - first.total.amountMinor;
    const savedShare = savedMinor / second.total.amountMinor;
    if (savedMinor < policy.minSavedMinor || savedShare < policy.minSavedShare) continue;
    savings.push({ card, cheapest: first.provider, against: second.provider, savedMinor, savedShare });
  }
  return savings.sort((a, b) => b.savedMinor - a.savedMinor).slice(0, max);
}
