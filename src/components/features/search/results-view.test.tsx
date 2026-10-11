import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsView, type ResultsViewProps } from "@/components/features/search/results-view";
import { groupProducts } from "@/domain/search/product-group";
import type { SearchQuery } from "@/domain/search/search-query";
import type { ProviderOutcome, SearchResponse } from "@/domain/search/search-response";
import type { ProviderId } from "@/domain/shared/provider";
import { makeProduct } from "@/test/product-factory";

// Server Actions run on the server; cards only need callable stand-ins here.
jest.mock("@/app/saved/actions", () => ({ setSavedAction: jest.fn() }));
jest.mock("@/app/alerts/actions", () => ({ createAlertAction: jest.fn() }));

const QUERY: SearchQuery = {
  rawText: "אוזניות אלחוטיות",
  detectedLanguage: "he",
  normalizedText: "wireless earbuds",
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
};

const OFFERS = [
  makeProduct({
    provider: "aliexpress",
    sku: "a",
    title: "Soundcore Life P3 Earbuds",
    total: 89_00,
    deliveryDays: [10, 12],
    freeShipping: true,
    rating: { average: 4.8, count: 1420 },
  }),
  makeProduct({
    provider: "temu",
    sku: "t",
    title: "Soundcore Life P3 Wireless Earbuds",
    total: 98_01,
    deliveryDays: [8, 10],
    freeShipping: true,
  }),
  makeProduct({
    provider: "amazon",
    sku: "z",
    title: "Anker Soundcore Life P3 Earbuds",
    total: 142_04,
    deliveryDays: [4, 4],
    freeShipping: false,
  }),
  makeProduct({ provider: "ebay", sku: "e", title: "Sony WH-CH720N Headphones", total: 310_00 }),
];

const ok = (provider: ProviderId, resultCount = 1): ProviderOutcome => ({
  provider,
  status: "ok",
  resultCount,
  latencyMs: 100,
  fromCache: false,
});

function response(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const groups = groupProducts(OFFERS);
  return {
    query: QUERY,
    groups,
    totalOffers: OFFERS.length,
    providers: [ok("aliexpress"), ok("temu"), ok("amazon"), ok("ebay")],
    pagination: { page: 1, pageSize: 20, totalResults: groups.length, hasNextPage: false },
    isPartial: false,
    generatedAt: "2026-10-11T09:00:00.000Z",
    ...overrides,
  };
}

/** Signed hrefs as the composition root would produce them (amazon deliberately missing → fallback). */
const LINKS: Readonly<Record<string, string>> = {
  "aliexpress:a": "/go/aliexpress%3Aa?d=x&s=y",
  "temu:t": "/go/temu%3At?d=x&s=y",
  "ebay:e": "/go/ebay%3Ae?d=x&s=y",
};

const renderView = (props: Partial<ResultsViewProps> = {}) =>
  render(
    <ResultsView
      response={response()}
      translation={{ from: "he", source: "glossary" }}
      demoMode={false}
      outboundLinks={LINKS}
      {...props}
    />,
  );

describe("ResultsView", () => {
  it("shows the translated query, counts, and one card per product group", () => {
    renderView();
    expect(screen.getByText("“wireless earbuds”")).toBeInTheDocument();
    expect(screen.getByText(/offers/)).toHaveTextContent("4 offers • 4 stores");
    const cards = within(screen.getByRole("list", { name: "Products" })).getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Soundcore Life P3 Earbuds",
    );
    expect(within(cards[0]!).getByText("₪89")).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/2 other stores from ₪98/)).toBeInTheDocument();
  });

  it("offers Compare for multi-store groups and a direct deal link for single-store ones", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Compare 3 stores for/ })).toBeInTheDocument();
    const deal = screen.getByRole("link", { name: /View deal ₪310/ });
    expect(deal).toHaveAttribute("href", "/go/ebay%3Ae?d=x&s=y");
    expect(deal).toHaveAttribute("rel", "nofollow sponsored noopener");
  });

  it("links sort chips to shareable URLs and marks the active one", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Sort results" });
    expect(within(nav).getByRole("link", { name: "Lowest Price" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Fastest Delivery" })).toHaveAttribute(
      "href",
      `/search?q=${encodeURIComponent("אוזניות אלחוטיות").replace(/%20/g, "+")}&sort=delivery_fastest`,
    );
  });

  it("explains when Hebrew couldn't be translated", () => {
    renderView({ translation: { from: "he", source: null } });
    expect(screen.getByText(/couldn't translate your Hebrew search/)).toBeInTheDocument();
  });

  it("says nothing about translation for English queries", () => {
    renderView({ translation: null });
    expect(screen.queryByText(/Showing results for/)).not.toBeInTheDocument();
  });

  it("labels demo data", () => {
    renderView({ demoMode: true });
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  it("warns about partial results and names the failing stores", () => {
    renderView({
      response: response({
        isPartial: true,
        providers: [
          ok("aliexpress"),
          {
            provider: "ebay",
            status: "timeout",
            resultCount: 0,
            latencyMs: 4000,
            fromCache: false,
            errorCode: "TIMEOUT",
          },
          { provider: "temu", status: "circuit_open", resultCount: 0, latencyMs: null, fromCache: false },
        ],
      }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("eBay (timed out), Temu (temporarily paused)");
  });

  it("shows an outage state when every store failed", () => {
    renderView({
      response: response({
        groups: [],
        totalOffers: 0,
        isPartial: true,
        providers: [
          {
            provider: "ebay",
            status: "error",
            resultCount: 0,
            latencyMs: 10,
            fromCache: false,
            errorCode: "HTTP_500",
          },
        ],
      }),
    });
    expect(screen.getByRole("heading", { name: "Stores aren't responding" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a no-matches state", () => {
    renderView({ response: response({ groups: [], totalOffers: 0 }) });
    expect(screen.getByRole("heading", { name: "No matches" })).toBeInTheDocument();
  });

  it("explains when no stores are configured", () => {
    renderView({ response: response({ groups: [], totalOffers: 0, providers: [] }) });
    expect(screen.getByRole("heading", { name: "No stores are connected yet" })).toBeInTheDocument();
  });
});

describe("ResultsView — wishlist buttons", () => {
  it("shows Save/Track on each card with the visitor's state when lists are available", () => {
    renderView({ userLists: { savedIds: ["aliexpress:a"], alertIds: [] } });
    expect(screen.getByRole("button", { name: /Remove .* from Saved/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { name: /^Save / })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Track price of / })).toHaveLength(2);
  });

  it("hides them when wishlists aren't available", () => {
    renderView({ userLists: null });
    expect(screen.queryByRole("button", { name: /^Save / })).not.toBeInTheDocument();
  });
});

describe("CompareSheet", () => {
  it("opens a bottom sheet with every store, best price first, and closes again", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: /Compare 3 stores for/ }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading")).toHaveTextContent(
      "Compare 3 stores: Soundcore Life P3 Earbuds",
    );

    const rows = within(sheet).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "AliExpress offer",
      "Temu offer",
      "Amazon offer",
    ]);
    expect(within(rows[0]!).getByText("Best price")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Total landed")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("+₪9 vs best")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Fastest")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("link", { name: /Go to AliExpress/ })).toHaveAttribute(
      "href",
      "/go/aliexpress%3Aa?d=x&s=y",
    );
    // No signed link for this offer: falls back to the clean store URL rather than breaking the click.
    expect(within(rows[2]!).getByRole("link", { name: "Go to Amazon — ₪142" })).toHaveAttribute(
      "href",
      "https://amazon.example/item/z",
    );

    await user.click(within(sheet).getByRole("button", { name: "Close comparison" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
