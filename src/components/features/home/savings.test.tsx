import { render, screen, within } from "@testing-library/react";
import type { SavingsCard } from "@/application/deals/savings";
import { Savings } from "@/components/features/home/savings";
import { money } from "@/domain/shared/money";

const SAVING: SavingsCard = {
  card: {
    label: "JBL Charge 5",
    query: "jbl charge 5",
    title: "JBL Charge 5",
    imageUrl: null,
    best: { provider: "ebay", total: money(520_00, "ILS") },
    stores: [
      { provider: "ebay", total: money(520_00, "ILS"), listings: 3 },
      { provider: "amazon", total: money(690_00, "ILS"), listings: 1 },
    ],
    unshippedStores: [],
    matchedBy: "model_number",
    lookAlike: false,
    unitPrice: null,
    pricesAsOf: "2026-10-14T07:30:00.000Z",
  },
  cheapest: "ebay",
  against: "amazon",
  savedMinor: 170_00,
  savedShare: 170 / 690,
};

describe("Savings", () => {
  it("shows the saving on the card, with ids of its own", () => {
    render(<Savings savings={[SAVING]} />);
    const card = within(screen.getByRole("list", { name: "Cross-store savings" })).getByRole("article", {
      name: "JBL Charge 5",
    });
    expect(card).toHaveTextContent("Save ₪170 vs Amazon");
    // The same card can sit in the trending grid or a category row: ids must not collide.
    expect(card).toHaveAttribute("aria-labelledby", "savings-jbl-charge-5");
  });

  it("words a photo match as looking identical, never as the same item", () => {
    const lookAlike: SavingsCard = {
      ...SAVING,
      card: {
        ...SAVING.card,
        label: "Magnetic cable clips",
        query: "cable clips",
        matchedBy: "visual_match",
        lookAlike: true,
      },
    };
    render(<Savings savings={[lookAlike]} />);
    expect(screen.getByRole("article", { name: "Magnetic cable clips" })).toHaveTextContent(
      "Looks identical, ₪170 less on eBay",
    );
  });

  it("renders nothing without savings", () => {
    const { container } = render(<Savings savings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
