import { isActive, NAV_ITEMS } from "@/components/layout/nav-items";

describe("NAV_ITEMS", () => {
  it("lists the four sections in tab-bar order", () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["Discover", "/"],
      ["Compare", "/search"],
      ["Saved", "/saved"],
      ["Alerts", "/alerts"],
    ]);
  });
});

describe("isActive", () => {
  it("matches home only on the home page", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/search")).toBe(false);
  });

  it("matches a section and its sub-paths, but not look-alike prefixes", () => {
    expect(isActive("/search", "/search")).toBe(true);
    expect(isActive("/saved", "/saved/archive")).toBe(true);
    expect(isActive("/saved", "/savedsearches")).toBe(false);
  });

  it("reads the same section in every language, and behind the English rewrite", () => {
    expect(isActive("/saved", "/he/saved")).toBe(true);
    expect(isActive("/search", "/en/search")).toBe(true);
    expect(isActive("/", "/he")).toBe(true);
    expect(isActive("/", "/en")).toBe(true);
  });
});
