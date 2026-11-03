import { catalogCategories, HEADPHONES_PILOT_PRODUCTS } from "@/config/pilot";
import { CATEGORIES, DEMO_CATEGORIES } from "@/config/categories";
import { parseServerEnv } from "@/config/env";
import { searchIntent } from "@/domain/search/search-intent";

it("keeps the approved pilot to one category and 15 distinct, specific models", () => {
  const config = parseServerEnv({ ONECART_HEADPHONES_PILOT: "true" });
  const categories = catalogCategories(config);
  expect(categories.map((category) => category.slug)).toEqual(["headphones"]);
  expect(categories[0]?.products).toHaveLength(15);
  expect(new Set(HEADPHONES_PILOT_PRODUCTS.map((product) => product.query)).size).toBe(15);
  for (const product of HEADPHONES_PILOT_PRODUCTS) expect(searchIntent(product.query).specific).toBe(true);
  expect(categories[0]?.he?.description.length).toBeLessThan(160);
});

it("keeps the existing catalog unless enabled and keeps demo runs deterministic", () => {
  expect(catalogCategories(parseServerEnv({}))).toBe(CATEGORIES);
  expect(
    catalogCategories(parseServerEnv({ ONECART_HEADPHONES_PILOT: "true", ONECART_DEMO_PROVIDERS: "true" })),
  ).toBe(DEMO_CATEGORIES);
  expect(() => parseServerEnv({ ONECART_HEADPHONES_PILOT: "yes" })).toThrow();
});
