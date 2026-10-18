import { CATEGORIES, DEMO_CATEGORIES, type Category } from "@/config/categories";
import { categoryBySlug } from "@/domain/deals/category";
import { TRENDING_QUERIES } from "@/config/trending";
import { searchIntent } from "@/domain/search/search-intent";
import { normalizeQueryText } from "@/domain/search/search-query";

describe.each([
  ["live", CATEGORIES],
  ["demo", DEMO_CATEGORIES],
] as const)("%s categories", (_name, categories) => {
  it("have unique, URL-safe slugs and unique product queries", () => {
    expect(new Set(categories.map((c) => c.slug)).size).toBe(categories.length);
    for (const { slug } of categories) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const queries = categories.flatMap((c) => c.products.map((p) => normalizeQueryText(p.query)));
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("declare the mode their queries read as", () => {
    for (const c of categories)
      for (const p of c.products)
        expect([p.query, searchIntent(normalizeQueryText(p.query)).mode]).toEqual([p.query, c.mode]);
  });

  it("have search-friendly copy: a title, a description under 160 characters, an intro", () => {
    for (const c of categories) {
      expect(c.seoTitle.length).toBeGreaterThan(10);
      expect(c.description.length).toBeLessThanOrEqual(160);
      expect(c.intro.length).toBeGreaterThan(40);
    }
  });
});

describe("live categories", () => {
  const products = CATEGORIES.flatMap((c) => c.products);

  it("are six branded and three generic homepage categories, ten products each", () => {
    expect(CATEGORIES.map((c) => [c.label, c.mode])).toEqual([
      ["Headphones", "branded"],
      ["Speakers", "branded"],
      ["Smart home", "branded"],
      ["Kitchen", "branded"],
      ["Phone accessories", "branded"],
      ["Gaming", "branded"],
      ["Kitchen gadgets", "generic"],
      ["Car accessories", "generic"],
      ["Desk gadgets", "generic"],
    ]);
    for (const c of CATEGORIES) expect(c.products).toHaveLength(10);
  });

  it("never repeat a trending query (both render on the homepage)", () => {
    const trending = new Set(TRENDING_QUERIES.map((t) => normalizeQueryText(t.query)));
    expect(products.filter((p) => trending.has(normalizeQueryText(p.query)))).toEqual([]);
  });

  const byMode = (mode: Category["mode"]) =>
    CATEGORIES.filter((c) => c.mode === mode).flatMap((c) => c.products.map((p) => [p.query]));

  // A card is the search's top result naming the product: a category word alone
  // ("air fryer") or an accessory search would never produce one.
  it.each(byMode("branded"))("branded %p names one specific product", (query) => {
    const intent = searchIntent(normalizeQueryText(query));
    expect(intent.specific).toBe(true);
    expect(intent.mode).toBe("branded");
    expect(intent.wantsAccessory).toBe(false);
  });

  // Generic queries name one commodity item, no brand or model: their look-alikes match by photo.
  it.each(byMode("generic"))("generic %p names no brand or model", (query) => {
    expect(searchIntent(normalizeQueryText(query)).mode).toBe("generic");
  });

  it("state no tax figures: those come from the import policy, so they can't go stale", () => {
    for (const c of CATEGORIES)
      expect(`${c.seoTitle} ${c.description} ${c.intro}`).not.toMatch(/\$|₪|\d+\s*%/);
  });
});

describe("categoryBySlug", () => {
  it("finds a category by its URL segment, or null", () => {
    expect(categoryBySlug(CATEGORIES, "kitchen")?.label).toBe("Kitchen");
    expect(categoryBySlug(CATEGORIES, "nope")).toBeNull();
  });
});
