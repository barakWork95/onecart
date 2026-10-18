import { categoryBySlug, categoryText, productLabel, type Category } from "@/domain/deals/category";

const CATEGORY: Category = {
  slug: "kitchen-gadgets",
  mode: "generic",
  label: "Kitchen gadgets",
  seoTitle: "Kitchen gadgets: prices in Israel compared",
  description: "Peelers and choppers compared.",
  intro: "Everyday kitchen gadgets, compared by landed price.",
  searchQuery: "kitchen gadgets",
  products: [
    { label: "Vegetable peeler", query: "vegetable peeler" },
    { label: "Garlic press", query: "garlic press" },
  ],
  he: {
    label: "גאדג׳טים למטבח",
    seoTitle: "גאדג׳טים למטבח: השוואת מחירים בישראל",
    description: "קולפנים וקוצצים בהשוואה.",
    intro: "גאדג׳טים יומיומיים למטבח, בהשוואה לפי המחיר הסופי.",
    products: { "vegetable peeler": "קולפן ירקות" },
  },
};

describe("categoryText", () => {
  it("gives a category's copy in each language", () => {
    expect(categoryText(CATEGORY, "en").label).toBe("Kitchen gadgets");
    expect(categoryText(CATEGORY, "he")).toEqual({
      label: "גאדג׳טים למטבח",
      seoTitle: "גאדג׳טים למטבח: השוואת מחירים בישראל",
      description: "קולפנים וקוצצים בהשוואה.",
      intro: "גאדג׳טים יומיומיים למטבח, בהשוואה לפי המחיר הסופי.",
    });
  });
});

describe("productLabel", () => {
  it("names a product in the language, falling back to its English label", () => {
    expect(productLabel(CATEGORY, "vegetable peeler", "Vegetable peeler", "he")).toBe("קולפן ירקות");
    expect(productLabel(CATEGORY, "garlic press", "Garlic press", "he")).toBe("Garlic press");
    expect(productLabel(CATEGORY, "vegetable peeler", "Vegetable peeler", "en")).toBe("Vegetable peeler");
  });
});

describe("categoryBySlug", () => {
  it("finds a category by its URL segment, or null", () => {
    expect(categoryBySlug([CATEGORY], "kitchen-gadgets")).toBe(CATEGORY);
    expect(categoryBySlug([CATEGORY], "nope")).toBeNull();
  });
});
