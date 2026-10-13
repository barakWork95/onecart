import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("sitemap.xml", () => {
  it("lists the static pages on the canonical host", () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://www.onecartapp.com/",
      "https://www.onecartapp.com/privacy",
      "https://www.onecartapp.com/terms",
    ]);
  });

  it("lists nothing robots.txt disallows", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallowed = [rule?.disallow ?? []].flat();
    for (const { url } of sitemap()) {
      const path = new URL(url).pathname;
      expect(disallowed.some((d) => path.startsWith(d))).toBe(false);
    }
  });
});
