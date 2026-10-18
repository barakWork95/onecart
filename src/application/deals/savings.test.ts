import { selectSavings } from "@/application/deals/savings";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

function card(
  query: string,
  prices: Partial<Record<ProviderId, number>>,
  matchedBy: TrendingCard["matchedBy"] = "model_number",
): TrendingCard {
  const stores = Object.entries(prices).map(([provider, shekels]) => ({
    provider: provider as ProviderId,
    total: money((shekels ?? 0) * 100, "ILS"),
    shippingKnown: true,
    listings: 1,
  }));
  return {
    label: query,
    query,
    title: query,
    imageUrl: null,
    best: { provider: stores[0]!.provider, total: stores[0]!.total },
    stores,
    unshippedStores: [],
    matchedBy,
    lookAlike: matchedBy === "visual_match",
    unitPrice: null,
    pricesAsOf: "2026-10-14T07:30:00.000Z",
  };
}

describe("selectSavings", () => {
  it("measures the cheapest store against the next one, biggest saving first", () => {
    const savings = selectSavings([
      card("small", { ebay: 100, amazon: 125 }),
      card("big", { amazon: 900, ebay: 700, aliexpress: 1200 }),
    ]);
    expect(savings.map((s) => [s.card.query, s.cheapest, s.against, s.savedMinor])).toEqual([
      ["big", "ebay", "amazon", 200_00],
      ["small", "ebay", "amazon", 25_00],
    ]);
    expect(savings[0]?.savedShare).toBeCloseTo(200 / 900);
  });

  it("needs two priced stores and a model-number match", () => {
    expect(
      selectSavings([
        card("single", { ebay: 100 }, "single"),
        card("similar", { ebay: 100, amazon: 300 }, "title_similarity"),
      ]),
    ).toEqual([]);
  });

  it("claims nothing when either store's shipping isn't quoted: its total isn't landed", () => {
    const unquoted = card("cable clips", { aliexpress: 3, ebay: 413 }, "visual_match");
    const [ali, ebay] = unquoted.stores;
    expect(selectSavings([{ ...unquoted, stores: [{ ...ali!, shippingKnown: false }, ebay!] }])).toEqual([]);
    expect(selectSavings([{ ...unquoted, stores: [ali!, { ...ebay!, shippingKnown: false }] }])).toEqual([]);
  });

  it("counts photo matches of unbranded items too", () => {
    const [saving] = selectSavings([card("cable clips", { aliexpress: 30, ebay: 419 }, "visual_match")]);
    expect(saving).toMatchObject({ cheapest: "aliexpress", against: "ebay", savedMinor: 389_00 });
  });

  it("needs at least ₪20 and 10% off the next store, inclusive", () => {
    expect(selectSavings([card("q1", { ebay: 180, amazon: 200 })])).toHaveLength(1);
    expect(selectSavings([card("q2", { ebay: 181, amazon: 200 })])).toEqual([]);
    expect(selectSavings([card("q3", { ebay: 60, amazon: 79 })])).toEqual([]);
  });

  it("counts a product once and caps the list", () => {
    const many = Array.from({ length: 8 }, (_, i) => card(`q${i}`, { ebay: 100, amazon: 200 + i }));
    expect(selectSavings([...many, many[0]!], 6)).toHaveLength(6);
    expect(selectSavings([many[0]!, many[0]!])).toHaveLength(1);
  });
});
