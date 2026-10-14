import { render, screen, within } from "@testing-library/react";
import { PriceDrops } from "@/components/features/home/price-drops";
import type { PriceDropCard } from "@/domain/deals/ports";
import { money } from "@/domain/shared/money";

const DROP: PriceDropCard = {
  productId: "ebay:395012345678",
  provider: "ebay",
  title: "JBL Charge 5 Portable Bluetooth Speaker",
  imageUrl: null,
  productUrl: "https://www.ebay.com/itm/395012345678",
  query: "jbl charge 5",
  current: money(420_00, "ILS"),
  typical: money(520_00, "ILS"),
  dropShare: 0.1923,
  historyDays: 12,
  observedAt: "2026-10-30T07:30:00.000Z",
};

describe("PriceDrops", () => {
  it("shows the drop against our own history, with a comparison link and a signed store link", () => {
    render(<PriceDrops drops={[{ drop: DROP, href: "/go/ebay%3A395012345678?d=x&s=y" }]} />);
    const card = within(screen.getByRole("list", { name: "Price drops" })).getByRole("article", {
      name: "JBL Charge 5 Portable Bluetooth Speaker",
    });
    expect(card).toHaveTextContent("−19%");
    expect(card).toHaveTextContent("₪420on eBay");
    expect(card).toHaveTextContent("Typically ₪520 over the last 12 days we checked.");
    expect(within(card).getByRole("link", { name: DROP.title })).toHaveAttribute(
      "href",
      "/search?q=jbl+charge+5",
    );
    const go = within(card).getByRole("link", { name: "View on eBay" });
    expect(go).toHaveAttribute("href", "/go/ebay%3A395012345678?d=x&s=y");
    expect(go).toHaveAttribute("rel", "nofollow sponsored noopener noreferrer");
    // 07:30 UTC is 09:30 in Israel once daylight saving ends (26 Oct 2026).
    expect(within(card).getByText("30 Oct, 09:30")).toHaveAttribute("datetime", DROP.observedAt);
  });

  it("renders nothing without drops", () => {
    const { container } = render(<PriceDrops drops={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
