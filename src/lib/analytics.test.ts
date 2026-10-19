import { track } from "@vercel/analytics";
import { analyticsTitle, priceIls, trackEvent } from "@/lib/analytics";
import { money } from "@/domain/shared/money";

jest.mock("@vercel/analytics", () => ({ track: jest.fn() }));
const tracked = track as jest.MockedFunction<typeof track>;

beforeEach(() => tracked.mockReset());

describe("trackEvent", () => {
  it("sends the event with its properties", () => {
    trackEvent("search_query", { query: "jbl flip 6", locale: "en", source: "input" });
    expect(tracked).toHaveBeenCalledWith("search_query", {
      query: "jbl flip 6",
      locale: "en",
      source: "input",
    });
  });

  it("never throws: analytics must not break a click or a search", () => {
    tracked.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackEvent("save_item", { product_title: "x", price_ils: 1, locale: "he" })).not.toThrow();
  });
});

describe("analyticsTitle and priceIls", () => {
  it("tidy a store title to one short line", () => {
    expect(analyticsTitle("  Sony   WH-1000XM5\nHeadphones ")).toBe("Sony WH-1000XM5 Headphones");
    expect(analyticsTitle("x".repeat(100))).toBe(`${"x".repeat(79)}…`);
  });

  it("read a price in shekels, to the agora", () => {
    expect(priceIls(money(89_99, "ILS"))).toBe(89.99);
  });
});
