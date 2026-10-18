import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSuggestion, prefersHebrew } from "@/components/layout/language-suggestion";

jest.mock("next/navigation", () => ({
  usePathname: () => "/c/headphones",
  useSearchParams: () => new URLSearchParams(),
}));

const languages = jest.spyOn(navigator, "languages", "get");
const props = { text: "OneCart זמין גם בעברית", cta: "מעבר לעברית", dismiss: "סגירה" };

beforeEach(() => localStorage.clear());

describe("prefersHebrew", () => {
  it("reads the browser's first choice only", () => {
    expect(prefersHebrew(["he-IL", "en-US"])).toBe(true);
    expect(prefersHebrew(["iw"])).toBe(true);
    expect(prefersHebrew(["en-US", "he"])).toBe(false);
    expect(prefersHebrew([])).toBe(false);
  });
});

describe("LanguageSuggestion", () => {
  it("offers this page in Hebrew to a Hebrew browser, until dismissed for good", async () => {
    languages.mockReturnValue(["he-IL", "en"]);
    const { unmount } = render(<LanguageSuggestion {...props} />);
    expect(await screen.findByRole("link", { name: "מעבר לעברית" })).toHaveAttribute(
      "href",
      "/he/c/headphones",
    );
    await userEvent.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    unmount();

    render(<LanguageSuggestion {...props} />);
    await Promise.resolve();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("stays out of the way for other browsers", async () => {
    languages.mockReturnValue(["en-US"]);
    render(<LanguageSuggestion {...props} />);
    await Promise.resolve();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
