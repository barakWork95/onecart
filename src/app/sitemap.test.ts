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

let hebrew = false;
jest.mock("@/i18n/enabled", () => ({ hebrewEnabled: () => hebrew }));

beforeEach(() => {
  hebrew = false;
});

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

  it("with Hebrew live, lists every page in both languages, each linked to the other", async () => {
    hebrew = true;
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toContain("https://www.onecartapp.com/he/c/headphones");
    // The legal pages are English only: listed once, with no Hebrew alternate.
    expect(entries.map((e) => e.url)).not.toContain("https://www.onecartapp.com/he/privacy");
    expect(entries.find((e) => e.url === "https://www.onecartapp.com/privacy")?.alternates).toBeUndefined();
    expect(entries).toHaveLength(8);
    expect(entries.find((e) => e.url === "https://www.onecartapp.com/c")?.alternates).toEqual({
      languages: {
        en: "https://www.onecartapp.com/c",
        he: "https://www.onecartapp.com/he/c",
        "x-default": "https://www.onecartapp.com/c",
      },
    });
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect([rule?.disallow ?? []].flat()).toContain("/he/search");
  });
});
