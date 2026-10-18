import { alternatesFor, isLocale, localizedPath, splitLocale } from "@/i18n/locales";

describe("locales", () => {
  it("knows its languages", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("keeps English URLs unprefixed and puts Hebrew under /he", () => {
    expect(localizedPath("en", "/c/headphones")).toBe("/c/headphones");
    expect(localizedPath("he", "/c/headphones")).toBe("/he/c/headphones");
    expect(localizedPath("he", "/")).toBe("/he");
  });

  it("splits a URL path into its language and the English path", () => {
    expect(splitLocale("/he/c/headphones")).toEqual({ locale: "he", path: "/c/headphones" });
    expect(splitLocale("/he")).toEqual({ locale: "he", path: "/" });
    expect(splitLocale("/c/headphones")).toEqual({ locale: "en", path: "/c/headphones" });
    expect(splitLocale("/")).toEqual({ locale: "en", path: "/" });
    // English pages are served from /en internally: usePathname() can report either form.
    expect(splitLocale("/en/c")).toEqual({ locale: "en", path: "/c" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
  });

  it("links a page's languages only once Hebrew is live", () => {
    expect(alternatesFor("en", "/c", { hebrew: false })).toEqual({ canonical: "/c" });
    expect(alternatesFor("he", "/c", { hebrew: true })).toEqual({
      canonical: "/he/c",
      languages: { en: "/c", he: "/he/c", "x-default": "/c" },
    });
  });
});
