import { DEMO_HOME_CATEGORIES, HOME_CATEGORIES } from "@/config/home";
import { DEMO_TRENDING_QUERIES, TRENDING_QUERIES } from "@/config/trending";
import { searchIntent } from "@/domain/search/search-intent";
import { normalizeQueryText } from "@/domain/search/search-query";

describe.each([
  ["live", HOME_CATEGORIES, TRENDING_QUERIES],
  ["demo", DEMO_HOME_CATEGORIES, DEMO_TRENDING_QUERIES],
] as const)("%s homepage categories", (_name, categories, trending) => {
  const products = categories.flatMap((c) => c.products);

  it("have unique slugs and product queries, none of them a trending query", () => {
    expect(new Set(categories.map((c) => c.slug)).size).toBe(categories.length);
    const queries = products.map((p) => normalizeQueryText(p.query));
    expect(new Set(queries).size).toBe(queries.length);
    const trendingQueries = new Set(trending.map((t) => normalizeQueryText(t.query)));
    // A query in both would render two cards with the same element id.
    expect(queries.filter((q) => trendingQueries.has(q))).toEqual([]);
  });

  // A card is the search's top result naming the product: a category word alone
  // ("air fryer") or an accessory search would never produce one.
  it.each(products.map((p) => [p.query]))("%p names one specific product", (query) => {
    const intent = searchIntent(normalizeQueryText(query));
    expect(intent.specific).toBe(true);
    expect(intent.wantsAccessory).toBe(false);
  });
});

it("has the six homepage categories", () => {
  expect(HOME_CATEGORIES.map((c) => c.label)).toEqual([
    "Headphones",
    "Speakers",
    "Smart home",
    "Kitchen",
    "Phone accessories",
    "Gaming",
  ]);
});
