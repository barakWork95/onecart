import { fireEvent, render, screen } from "@testing-library/react";
import { track } from "@vercel/analytics";
import { SearchBox } from "@/components/features/search/search-box";

jest.mock("@vercel/analytics", () => ({ track: jest.fn() }));
jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.ComponentProps<"form">) => <form {...props}>{children}</form>,
}));

function stubScreen(wide: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: wide && query === "(min-width: 640px)",
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

describe("SearchBox placeholder", () => {
  it("shows the full hint where it fits", () => {
    stubScreen(true);
    render(<SearchBox />);
    expect(screen.getByRole("searchbox", { name: "Search products" })).toHaveAttribute(
      "placeholder",
      "Search products, brands or models…",
    );
  });

  it("shows the short hint on phones, where the full one would be cut off", () => {
    stubScreen(false);
    render(<SearchBox />);
    expect(screen.getByRole("searchbox", { name: "Search products" })).toHaveAttribute(
      "placeholder",
      "Search products…",
    );
  });
});

describe("SearchBox analytics", () => {
  it("reports a submitted search, typed in the box, with the page's language", () => {
    stubScreen(false);
    render(<SearchBox defaultValue="  אוזניות   סוני " locale="he" />);
    fireEvent.submit(screen.getByRole("search"));
    expect(track).toHaveBeenCalledWith("search_query", {
      query: "אוזניות סוני",
      locale: "he",
      source: "input",
    });
  });
});
