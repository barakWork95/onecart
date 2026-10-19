import { render, screen, within } from "@testing-library/react";
import type { ClickDashboard } from "@/application/affiliate/click-analytics";
import { ClickAnalyticsView } from "@/components/features/internal/click-analytics-view";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

const DASHBOARD: ClickDashboard = {
  kpis: { today: 5, last7Days: 9, last30Days: 1234 },
  byStore: [
    { provider: "ebay", clicks: 800 },
    { provider: "aliexpress", clicks: 400 },
    { provider: "amazon", clicks: 34 },
  ],
  topProducts: [
    { productId: "ebay:jbl", provider: "ebay", title: "JBL Charge 5", clicks: 40 },
    { productId: "amazon:B1", provider: "amazon", title: null, clicks: 3 },
  ],
  recent: [
    {
      at: "2026-10-19T09:05:00.000Z",
      provider: "aliexpress",
      productId: "aliexpress:clips",
      title: "Magnetic cable clips",
      priceAgorot: 12_40,
      bestDeal: true,
      locale: "he",
    },
    {
      at: "2026-10-13T08:00:00.000Z",
      provider: "amazon",
      productId: "amazon:B1",
      title: null,
      priceAgorot: null,
      bestDeal: false,
      locale: "en",
    },
  ],
};

describe("ClickAnalyticsView", () => {
  it("shows the KPIs, the store breakdown and the top products", () => {
    render(<ClickAnalyticsView state={{ kind: "ready", dashboard: DASHBOARD }} />);
    const kpis = screen.getByRole("list", { name: "Clicks" });
    expect(within(kpis).getByText("Today").nextElementSibling).toHaveTextContent("5");
    expect(within(kpis).getByText("Last 7 days").nextElementSibling).toHaveTextContent("9");
    expect(within(kpis).getByText("Last 30 days").nextElementSibling).toHaveTextContent("1,234");

    const stores = screen.getByRole("table", { name: "Clicks by store, last 30 days" });
    expect(
      within(stores)
        .getAllByRole("row")
        .map((r) => r.textContent),
    ).toEqual(["StoreClicksShare", "eBay80065%", "AliExpress40032%", "Amazon343%"]);

    const top = screen.getByRole("table", { name: "Top products, last 30 days" });
    expect(within(top).getByText("JBL Charge 5")).toBeInTheDocument();
    // Clicks recorded before titles existed show the product id.
    expect(within(top).getByText("amazon:B1")).toBeInTheDocument();
  });

  it("lists the latest clicks: Israel time, store, product, price, best deal and language", () => {
    render(<ClickAnalyticsView state={{ kind: "ready", dashboard: DASHBOARD }} />);
    const recent = screen.getByRole("table", { name: "Latest clicks" });
    const [, first, second] = within(recent).getAllByRole("row");
    expect(first).toHaveTextContent("19 Oct, 12:05");
    expect(first).toHaveTextContent("AliExpress");
    expect(first).toHaveTextContent("Magnetic cable clips");
    expect(first).toHaveTextContent("₪12.40");
    expect(within(first!).getByText("Best deal")).toBeInTheDocument();
    expect(first).toHaveTextContent("HE");
    expect(second).toHaveTextContent("amazon:B1");
    expect(second).toHaveTextContent("—");
    expect(within(second!).queryByText("Best deal")).not.toBeInTheDocument();
  });

  it("says when there's nothing yet, when storage isn't configured, and when loading failed", () => {
    const empty = {
      kpis: { today: 0, last7Days: 0, last30Days: 0 },
      byStore: [],
      topProducts: [],
      recent: [],
    };
    const { rerender } = render(<ClickAnalyticsView state={{ kind: "ready", dashboard: empty }} />);
    expect(screen.getByText("No clicks recorded yet.")).toBeInTheDocument();
    rerender(<ClickAnalyticsView state={{ kind: "not_configured" }} />);
    expect(screen.getByText(/needs SUPABASE_SECRET_KEY/)).toBeInTheDocument();
    rerender(<ClickAnalyticsView state={{ kind: "error" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the click analytics");
  });
});
