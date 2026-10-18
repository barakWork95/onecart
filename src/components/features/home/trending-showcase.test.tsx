import { render, screen, within } from "@testing-library/react";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { trendingCardId } from "@/components/features/home/trending-card";
import { TrendingShowcase } from "@/components/features/home/trending-showcase";
import { money } from "@/domain/shared/money";

const XM5: TrendingCard = {
  label: "Sony WH-1000XM5",
  query: "sony wh-1000xm5",
  title: "Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black",
  imageUrl: "https://m.media-amazon.com/images/I/61O3iMlnJIL._AC_SL500_.jpg",
  best: { provider: "ebay", total: money(907_00, "ILS") },
  stores: [{ provider: "ebay", total: money(907_00, "ILS"), listings: 19 }],
  unshippedStores: ["amazon"],
  matchedBy: "single",
  lookAlike: false,
  unitPrice: null,
  pricesAsOf: "2026-10-13T07:30:00.000Z",
};

const DUO: TrendingCard = {
  ...XM5,
  label: "Instant Pot Duo",
  query: "instant pot duo",
  title: "Duo 6 Qt 7-in-1 Electric Pressure Cooker",
  best: { provider: "amazon", total: money(288_00, "ILS") },
  stores: [
    { provider: "amazon", total: money(288_00, "ILS"), listings: 1 },
    { provider: "ebay", total: money(6379_00, "ILS"), listings: 1 },
  ],
  unshippedStores: [],
  matchedBy: "title_similarity",
  lookAlike: false,
  unitPrice: null,
};

describe("TrendingShowcase", () => {
  it("shows each product with its best landed price, every store, and when prices were checked", () => {
    render(<TrendingShowcase cards={[XM5, DUO]} />);
    const grid = screen.getByRole("list", { name: "Trending products" });
    const [xm5, duo] = within(grid).getAllByRole("article");

    expect(within(xm5!).getByRole("link", { name: "Sony WH-1000XM5" })).toHaveAttribute(
      "href",
      "/search?q=sony+wh-1000xm5",
    );
    expect(xm5).toHaveTextContent("From₪907on eBay");
    const stores = within(xm5!).getByRole("list", { name: "Stores" });
    expect(stores).toHaveTextContent("eBay ₪907· 19 listings");
    expect(stores).toHaveTextContent("Amazon: no offer to Israel");
    // Only priced stores count: Amazon won't ship it.
    expect(within(xm5!).queryByText(/\d stores/)).not.toBeInTheDocument();
    expect(within(duo!).getByText("2 stores")).toBeInTheDocument();
    // 07:30 UTC is 10:30 in Israel (IDT).
    expect(within(xm5!).getByText("13 Oct, 10:30")).toHaveAttribute("datetime", "2026-10-13T07:30:00.000Z");

    expect(duo).toHaveTextContent("From₪288on Amazon");
    expect(within(duo!).getByRole("list", { name: "Stores" })).toHaveTextContent("Amazon ₪288eBay ₪6,379");
  });

  it("names each card by its product with a valid id (queries contain spaces)", () => {
    render(<TrendingShowcase cards={[{ ...XM5, label: "AirPods Pro", query: "airpods pro" }]} />);
    const card = screen.getByRole("article", { name: "AirPods Pro" });
    expect(card).toHaveAttribute("aria-labelledby", "trending-airpods-pro");
    expect(trendingCardId("Sony WH-1000XM5")).toBe("trending-sony-wh-1000xm5");
  });

  it("badges a photo-matched card and prices a multi-pack per piece", () => {
    const clips: TrendingCard = {
      ...XM5,
      label: "Cable clips",
      query: "cable clips",
      matchedBy: "visual_match",
      lookAlike: true,
      unitPrice: { pack: 10, perUnit: money(3_20, "ILS") },
    };
    render(<TrendingShowcase cards={[clips]} />);
    const card = screen.getByRole("article", { name: "Cable clips" });
    expect(within(card).getByText("Looks identical · Best value")).toBeInTheDocument();
    expect(within(card).getByText("₪3.20 per piece")).toBeInTheDocument();
  });

  it("renders nothing while no trending product is cached", () => {
    const { container } = render(<TrendingShowcase cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
