import { fireEvent, render, screen } from "@testing-library/react";
import { track } from "@vercel/analytics";
import { PopularSearches } from "@/components/features/search/popular-searches";

jest.mock("@vercel/analytics", () => ({ track: jest.fn() }));

describe("PopularSearches", () => {
  it("links each pill to its search, in the page's language, and reports the pick", () => {
    render(<PopularSearches heading="חיפושים פופולריים" locale="he" />);
    const pill = screen.getByRole("link", { name: "JBL Flip 6" });
    expect(pill).toHaveAttribute("href", "/he/search?q=jbl+flip+6");
    fireEvent.click(pill);
    expect(track).toHaveBeenCalledWith("search_query", {
      query: "jbl flip 6",
      locale: "he",
      source: "trending_pill",
    });
  });
});
