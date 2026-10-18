import { render, screen } from "@testing-library/react";
import { LanguageSwitcher, switchedHref } from "@/components/layout/language-switcher";

let pathname = "/c/headphones";
let search = "";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

describe("switchedHref", () => {
  it("maps a page to the same page in the other language, keeping the query", () => {
    expect(switchedHref("/c/headphones", "", "he")).toBe("/he/c/headphones");
    expect(switchedHref("/he/c/headphones", "", "en")).toBe("/c/headphones");
    expect(switchedHref("/", "", "he")).toBe("/he");
    expect(switchedHref("/he", "", "en")).toBe("/");
    expect(switchedHref("/search", "q=air+fryer", "he")).toBe("/he/search?q=air+fryer");
  });
});

describe("LanguageSwitcher", () => {
  it("links to this page in the other language, named in that language", () => {
    pathname = "/search";
    search = "q=jbl";
    render(<LanguageSwitcher to="he" text="עברית" label="View this page in Hebrew" />);
    const link = screen.getByRole("link", { name: "View this page in Hebrew" });
    expect(link).toHaveAttribute("href", "/he/search?q=jbl");
    expect(link).toHaveAttribute("lang", "he");
    expect(link).toHaveTextContent("עברית");
  });
});
