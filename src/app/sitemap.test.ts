import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

// The sitemap reads category pages through the composition root; here, two
// categories: one with enough products to index, one still thin.
jest.mock("@/app/_composition", () => ({
  categoryList: () => [
    { slug: "headphones", label: "Headphones" },
    { slug: "gaming", label: "Gaming" },
  ],
  categoryPageData: async (slug: string) => ({
    page: { category: { slug }, indexable: slug === "headphones" },
    goLinks: {},
  }),
}));

describe("sitemap.xml", () => {
  it("lists the static pages and indexable category pages on the canonical host", async () => {
    expect((await sitemap()).map((e) => e.url)).toEqual([
      "https://www.onecartapp.com/",
      "https://www.onecartapp.com/c",
      "https://www.onecartapp.com/c/headphones",
      "https://www.onecartapp.com/privacy",
      "https://www.onecartapp.com/terms",
    ]);
  });

  it("lists nothing robots.txt disallows", async () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallowed = [rule?.disallow ?? []].flat();
    for (const { url } of await sitemap()) {
      const path = new URL(url).pathname;
      expect(disallowed.some((d) => path.startsWith(d))).toBe(false);
    }
  });
});
