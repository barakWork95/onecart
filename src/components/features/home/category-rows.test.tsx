import { render, screen, within } from "@testing-library/react";
import type { TrendingCard } from "@/application/deals/trending-showcase";
import { CategoryRows, CategoryRowsSkeleton } from "@/components/features/home/category-rows";
import { CATEGORIES } from "@/config/categories";
import { categoryBySlug } from "@/domain/deals/category";
import { money } from "@/domain/shared/money";

const card = (label: string, query: string): TrendingCard => ({
  label,
  query,
  title: `${label} — store title`,
  imageUrl: null,
  best: { provider: "ebay", total: money(499_00, "ILS") },
  stores: [{ provider: "ebay", total: money(499_00, "ILS"), shippingKnown: true, listings: 3 }],
  unshippedStores: [],
  matchedBy: "single",
  lookAlike: false,
  unitPrice: null,
  pricesAsOf: "2026-10-14T07:30:00.000Z",
});

const category = (slug: string) => {
  const found = categoryBySlug(CATEGORIES, slug);
  if (!found) throw new Error(`no category ${slug}`);
  return found;
};

const HEADPHONES = {
  category: category("headphones"),
  cards: [card("Sony WH-CH720N", "sony wh-ch720n"), card("JBL Tune 520BT", "jbl tune 520bt")],
};
const GAMING = {
  category: category("gaming"),
  cards: [card("Nintendo Switch OLED", "nintendo switch oled")],
};

describe("CategoryRows", () => {
  it("names the row and its products in Hebrew, and links within /he", () => {
    const gadgets = {
      category: category("kitchen-gadgets"),
      cards: [card("Vegetable peeler", "vegetable peeler"), card("Garlic press", "garlic press")],
    };
    render(<CategoryRows rows={[gadgets]} locale="he" />);
    const region = screen.getByRole("region", { name: "גאדג׳טים למטבח" });
    const row = within(region).getByRole("list", { name: "מוצרים בקטגוריה גאדג׳טים למטבח" });
    expect(within(row).getByRole("link", { name: "קולפן ירקות" })).toHaveAttribute(
      "href",
      "/he/search?q=vegetable+peeler",
    );
    expect(within(region).getByRole("link", { name: /^לכל המוצרים/ })).toHaveAttribute(
      "href",
      "/he/c/kitchen-gadgets",
    );
  });

  it("renders one named section per category with its product cards", () => {
    render(<CategoryRows rows={[HEADPHONES, GAMING]} />);
    const headphones = screen.getByRole("region", { name: "Headphones" });
    const row = within(headphones).getByRole("list", { name: "Headphones products" });
    expect(
      within(row)
        .getAllByRole("article")
        .map((a) => a.getAttribute("aria-labelledby")),
    ).toEqual(["category-sony-wh-ch720n", "category-jbl-tune-520bt"]);
    expect(within(row).getByRole("link", { name: "Sony WH-CH720N" })).toHaveAttribute(
      "href",
      "/search?q=sony+wh-ch720n",
    );
    expect(screen.getByRole("region", { name: "Gaming" })).toBeInTheDocument();
  });

  it("links each row to its category page, with an accessible name per row", () => {
    render(<CategoryRows rows={[HEADPHONES, GAMING]} />);
    expect(screen.getByRole("link", { name: "See all headphones" })).toHaveAttribute("href", "/c/headphones");
    expect(screen.getByRole("link", { name: "See all gaming" })).toHaveAttribute("href", "/c/gaming");
  });

  it("renders nothing without rows; the skeleton is hidden from assistive tech", () => {
    const { container } = render(<CategoryRows rows={[]} />);
    expect(container).toBeEmptyDOMElement();
    const skeleton = render(<CategoryRowsSkeleton />);
    expect(skeleton.container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
