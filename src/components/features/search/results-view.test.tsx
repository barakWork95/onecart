import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nextPageHref, ResultsView, type ResultsViewProps } from "@/components/features/search/results-view";
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
      translation={{ from: "he", source: "glossary", partial: false }}
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
    expect(within(cards[0]!).getByText("Same item · 3 stores")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("total landed")).toBeInTheDocument();
  });

  it("offers Compare for multi-store groups and a direct deal link for single-store ones", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Compare 3 stores for/ })).toBeInTheDocument();
    const deal = screen.getByRole("link", { name: /View deal ₪310/ });
    expect(deal).toHaveAttribute("href", "/go/ebay%3Ae?d=x&s=y");
    expect(deal).toHaveAttribute("rel", "nofollow sponsored noopener noreferrer");
  });

  it("spells out the cross-store comparison and the best deal on a grouped card", () => {
    renderView();
    const [grouped] = within(screen.getByRole("list", { name: "Products" })).getAllByRole("article");
    expect(
      within(grouped!)
        .getByText(/^Available on 3 stores/)
        .closest("p"),
    ).toHaveTextContent(
      "Available on 3 stores: AliExpress ₪89 vs Temu ₪98 vs Amazon ₪142 — Best deal on AliExpress",
    );
  });

  it("labels a title-only match as a similar item", () => {
    const pillows = groupProducts([
      makeProduct({ provider: "amazon", sku: "p1", title: "Philips Cervical Memory Foam Pillow" }),
      makeProduct({ provider: "ebay", sku: "p2", title: "Philips Memory Foam Pillow, Cervical" }),
    ]);
    renderView({ response: response({ groups: pillows }) });
    expect(screen.getByText("Similar item · 2 stores")).toBeInTheDocument();
  });

  it("badges a photo match 'Looks identical · Best value', prices packs per piece, and names its sellers", async () => {
    const user = userEvent.setup();
    const ebay = makeProduct({
      provider: "ebay",
      sku: "c1",
      title: "10 Pcs Magnetic Cable Holder Clip Organizer",
      total: 60_00,
      sellerName: "tidyhome",
    });
    const ali = makeProduct({
      provider: "aliexpress",
      sku: "c2",
      title: "10 Pcs Magnetic Cable Organizer Clip",
      total: 32_00,
      sellerName: "Clip Factory Store",
    });
    const clips = groupProducts([ebay, ali], {
      imageHashes: new Map([
        [ebay.imageUrl!, "e0b2b6969e9c9c9c"],
        [ali.imageUrl!, "e0b2b6969fb80ed5"],
      ]),
    });
    renderView({ response: response({ groups: clips }) });
    const card = screen.getByRole("article", { name: /Magnetic Cable/ });
    expect(within(card).getByText("Looks identical · Best value")).toBeInTheDocument();
    expect(within(card).getByText("Looks identical · 2 stores")).toBeInTheDocument();
    expect(within(card).getByText("₪3.20 per piece")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Compare 2 stores for/ }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent(
      "Matched by product photo and specs, sold by different sellers (Clip Factory Store, tidyhome).",
    );
  });

  it("offers a focused search at the other stores on a single-store card", () => {
    renderView();
    const find = screen.getByRole("link", { name: /^Find on other stores: search for Sony WH-CH720N/ });
    expect(find).toHaveAttribute("href", "/search?q=Sony+WH-CH720N+Headphones");
    // Grouped cards compare instead.
    expect(screen.getAllByRole("link", { name: /^Find on/ })).toHaveLength(1);
  });

  it("names the other store when only one more is connected", () => {
    renderView({ response: response({ providers: [ok("amazon"), ok("ebay")] }) });
    expect(screen.getByRole("link", { name: /^Find on Amazon:/ })).toBeInTheDocument();
  });

  it("offers Load more for the next page, keeping sort and filters", () => {
    renderView({
      response: response({
        query: { ...QUERY, page: 2, filters: { freeShippingOnly: true } },
        pagination: { page: 2, pageSize: 20, totalResults: 64, hasNextPage: true },
      }),
    });
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      nextPageHref({ ...QUERY, filters: { freeShippingOnly: true } }, 3),
    );
    expect(screen.getByText("Showing 2 products")).toBeInTheDocument();
  });

  it("says when every result is shown instead of offering more", () => {
    renderView();
    expect(screen.queryByRole("link", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByText(/that's everything the stores returned/)).toBeInTheDocument();
  });

  it("marks the active sort chip and lets a second tap clear it back to best match", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Sort results" });
    const q = encodeURIComponent("אוזניות אלחוטיות").replace(/%20/g, "+");
    const lowest = within(nav).getByRole("link", { name: "Lowest Price" });
    expect(lowest).toHaveAttribute("aria-current", "true");
    expect(lowest).toHaveAttribute("href", `/search?q=${q}`);
    expect(within(nav).getByRole("link", { name: "Fastest Delivery" })).toHaveAttribute(
      "href",
      `/search?q=${q}&sort=delivery_fastest`,
    );
  });

  it("highlights no chip and says 'Best match' under the default relevance sort", () => {
    renderView({ response: response({ query: { ...QUERY, sort: "relevance" } }) });
    const nav = screen.getByRole("navigation", { name: "Sort results" });
    expect(within(nav).queryByRole("link", { current: "true" })).not.toBeInTheDocument();
    expect(screen.getByText(/Best match/)).toBeInTheDocument();
  });

  it("lays products out as a grid of cards with the price prominent", () => {
    const { container } = renderView();
    const image = container.querySelector("article img");
    // Amazon-style: whole product visible (contain) with gentle padding on a white tile.
    expect(image).toHaveClass("object-contain", "p-4");
    expect(image).not.toHaveClass("object-cover");
    expect(image?.parentElement).toHaveClass("bg-white", "aspect-square");
    expect(screen.getByRole("list", { name: "Products" })).toHaveClass(
      "grid",
      "grid-cols-2",
      "lg:grid-cols-3",
    );
    expect(screen.getByText("₪89")).toHaveClass("text-2xl", "font-extrabold");
  });

  it("explains when Hebrew couldn't be translated", () => {
    renderView({ translation: { from: "he", source: null, partial: false } });
    expect(screen.getByText(/couldn't translate your Hebrew search/)).toBeInTheDocument();
  });

  it("tells the shopper when only part of a Hebrew query could be translated", () => {
    renderView({ translation: { from: "he", source: "glossary", partial: true } });
    expect(screen.getByText(/some words couldn't be translated/)).toBeInTheDocument();
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

describe("ResultsView — a store that won't ship to Israel", () => {
  const xm5 = makeProduct({
    provider: "ebay",
    sku: "x",
    title: "Sony WH-1000XM5 Headphones Black",
    total: 1066_00,
  });
  const [group] = groupProducts([xm5], {
    unavailable: [
      {
        id: "amazon:B09XS7JWHH",
        provider: "amazon",
        providerProductId: "B09XS7JWHH",
        title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
        productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
        imageUrl: null,
        reason: "no_offer_to_destination",
      },
    ],
  });

  it("makes a comparison card: eBay's price against Amazon's “no offer”, with a sheet listing both", async () => {
    const user = userEvent.setup();
    renderView({
      response: response({ groups: group ? [group] : [], providers: [ok("amazon"), ok("ebay")] }),
      outboundLinks: {
        "ebay:x": "/go/ebay%3Ax?d=x&s=y",
        "amazon:B09XS7JWHH": "/go/amazon%3AB09XS7JWHH?d=x&s=y",
      },
    });
    expect(screen.getByText(/^Compared on 2 stores/).closest("p")).toHaveTextContent(
      "Compared on 2 stores: eBay ₪1,066 vs Amazon: no offer to Israel — Only eBay ships it to Israel",
    );
    expect(screen.queryByRole("link", { name: /^Find on/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Compare 2 stores for Sony WH-1000XM5/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("listitem", { name: "Amazon: no offer to Israel" })).toHaveTextContent(
      "Listed, but no offer ships it to Israel",
    );
    expect(within(sheet).getByRole("link", { name: "View on Amazon (no offer to Israel)" })).toHaveAttribute(
      "href",
      "/go/amazon%3AB09XS7JWHH?d=x&s=y",
    );
    expect(within(sheet).getByRole("link", { name: /Go to eBay/ })).toHaveAttribute(
      "href",
      "/go/ebay%3Ax?d=x&s=y",
    );
  });
});

describe("ResultsView — one card for a store's many listings", () => {
  const xm5 = (sku: string, title: string, total: number) =>
    makeProduct({ provider: "ebay", sku, title, total });
  const listings = [
    xm5("x1", "Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black", 1012_00),
    xm5("x2", "Sony WH-1000XM5SA Wireless Noise Canceling Headphones Silver", 1100_00),
    xm5("x3", "Sony WH-1000XM5 PM Smoky Pink Wireless Noise Cancelling Headphones", 1400_00),
  ];
  const noOffer = {
    id: "amazon:B09XS7JWHH",
    provider: "amazon" as const,
    providerProductId: "B09XS7JWHH",
    title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
    productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
    imageUrl: null,
    reason: "no_offer_to_destination" as const,
  };
  const links = Object.fromEntries(listings.map((l) => [l.id, `/go/${l.id}`]));

  it("shows eBay's lowest price and listing count against Amazon's “no offer”, with every listing in a tray", async () => {
    const user = userEvent.setup();
    const groups = groupProducts(listings, { unavailable: [noOffer] });
    expect(groups).toHaveLength(1);
    renderView({
      response: response({ groups, providers: [ok("amazon"), ok("ebay")] }),
      outboundLinks: links,
    });

    const card = screen.getByRole("article");
    expect(within(card).getByText("eBay · 3 listings")).toBeInTheDocument();
    expect(
      within(card)
        .getByText(/^Compared on 2 stores/)
        .closest("p"),
    ).toHaveTextContent(
      "Compared on 2 stores: eBay from ₪1,012 (3 listings) vs Amazon: no offer to Israel — Only eBay ships it to Israel",
    );

    await user.click(within(card).getByRole("button", { name: /^Compare 2 stores for/ }));
    const sheet = await screen.findByRole("dialog");
    const tray = within(sheet).getByText("All 3 eBay listings");
    expect(within(sheet).getByRole("list", { name: "eBay listings", hidden: true })).not.toBeVisible();
    await user.click(tray);
    const trayList = within(sheet).getByRole("list", { name: "eBay listings" });
    expect(within(trayList).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(trayList).getByRole("link", { name: /^Go to eBay — ₪1,400: Sony WH-1000XM5 PM Smoky Pink/ }),
    ).toHaveAttribute("href", "/go/ebay:x3");
  });

  it("opens a listings sheet for one store with several sellers and no other store", async () => {
    const user = userEvent.setup();
    renderView({
      response: response({ groups: groupProducts(listings), providers: [ok("ebay")] }),
      outboundLinks: links,
    });
    const card = screen.getByRole("article");
    expect(
      within(card)
        .getByText(/^3 listings on eBay/)
        .closest("p"),
    ).toHaveTextContent("3 listings on eBay: from ₪1,012 to ₪1,400");
    await user.click(
      within(card).getByRole("button", {
        name: "See 3 eBay listings for Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black",
      }),
    );
    expect(await screen.findByRole("heading", { name: /^3 eBay listings: / })).toBeInTheDocument();
  });
});

describe("ResultsView — Amazon unavailable (quota used up)", () => {
  const amazonDown: ProviderOutcome = {
    provider: "amazon",
    status: "error",
    resultCount: 0,
    latencyMs: 120,
    fromCache: false,
    errorCode: "QUOTA_EXHAUSTED",
  };

  it("keeps eBay's results, says why, and offers “Check Amazon” instead of “Find on Amazon”", () => {
    const sony = groupProducts([OFFERS[3]!]);
    renderView({
      response: response({ groups: sony, isPartial: true, providers: [amazonDown, ok("ebay")] }),
      storeChecks: { [sony[0]!.id]: { provider: "amazon", href: "/go/amazon-search%3Ax?d=x&s=y" } },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Some stores are unavailable right now: Amazon (unavailable). Showing results from the rest; “Check Amazon” on a card searches that store for the item.",
    );
    const check = screen.getByRole("link", { name: "Check Amazon for Sony WH-CH720N Headphones" });
    expect(check).toHaveAttribute("href", "/go/amazon-search%3Ax?d=x&s=y");
    expect(check).toHaveAttribute("target", "_blank");
    expect(check).toHaveAttribute("rel", "nofollow sponsored noopener noreferrer");
    expect(screen.queryByRole("link", { name: /^Find on/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View deal ₪310/ })).toBeInTheDocument();
  });

  it("offers direct store searches when every store is down, instead of a dead end", () => {
    renderView({
      response: response({
        groups: [],
        totalOffers: 0,
        isPartial: true,
        providers: [amazonDown, { ...amazonDown, provider: "ebay", errorCode: "EBAY_2001" }],
      }),
      storeSearches: [
        { provider: "amazon", href: "/go/amazon-search%3Aq?d=a&s=b" },
        { provider: "ebay", href: "/go/ebay-search%3Aq?d=c&s=d" },
      ],
    });
    expect(screen.getByRole("heading", { name: "Stores aren't responding" })).toBeInTheDocument();
    const direct = screen.getByRole("list", { name: "Search the stores directly" });
    expect(within(direct).getByRole("link", { name: "Search Amazon" })).toHaveAttribute(
      "href",
      "/go/amazon-search%3Aq?d=a&s=b",
    );
    expect(within(direct).getByRole("link", { name: "Search eBay" })).toHaveAttribute(
      "rel",
      "nofollow sponsored noopener noreferrer",
    );
  });

  it("labels stores answering from recorded samples", () => {
    renderView({ sampleStores: ["amazon"] });
    expect(
      screen.getByText(/Amazon results here are recorded samples, not live prices\./),
    ).toBeInTheDocument();
  });
});

describe("ResultsView — outbound link audit", () => {
  /** Every anchor leaving OneCart: through the signed /go redirect, new tab, affiliate rel. */
  function expectOutbound(anchor: HTMLElement) {
    expect(anchor.getAttribute("href")).toMatch(/^\/go\//);
    expect(anchor).toHaveAttribute("target", "_blank");
    expect((anchor.getAttribute("rel") ?? "").split(" ").sort()).toEqual(
      ["nofollow", "noopener", "noreferrer", "sponsored"].sort(),
    );
  }

  it("covers View deal, Go in the sheet, every listing in the tray, Check Amazon, and store searches", async () => {
    const user = userEvent.setup();
    const xm5 = (sku: string, title: string, total: number) =>
      makeProduct({ provider: "ebay", sku, title, total });
    const collapsed = groupProducts([
      xm5("x1", "Sony WH-1000XM5 Noise Cancelling Wireless Headphones Black", 1012_00),
      xm5("x2", "Sony WH-1000XM5SA Wireless Noise Canceling Headphones Silver", 1100_00),
      makeProduct({
        provider: "amazon",
        sku: "z1",
        title: "Sony WH-1000XM5 Wireless Headphones Black",
        total: 1150_00,
      }),
    ]);
    const single = groupProducts([OFFERS[3]!]);
    const groups = [...collapsed, ...single];
    const links = Object.fromEntries(
      groups.flatMap((g) => g.listings).map((l) => [l.id, `/go/${encodeURIComponent(l.id)}?d=x&s=y`]),
    );
    renderView({
      response: response({ groups, providers: [ok("amazon"), ok("ebay")] }),
      outboundLinks: links,
      storeChecks: { [single[0]!.id]: { provider: "amazon", href: "/go/amazon%3Asearch%3Ax?d=x&s=y" } },
    });

    const external = () =>
      screen.getAllByRole("link").filter((a) => /^(\/go\/|https?:)/.test(a.getAttribute("href") ?? ""));
    const onCards = external();
    expect(onCards.map((a) => a.textContent)).toEqual(
      expect.arrayContaining(["View deal ₪310", "Check Amazon"]),
    );
    onCards.forEach(expectOutbound);

    await user.click(screen.getByRole("button", { name: /^Compare 2 stores for/ }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByText("All 2 eBay listings"));
    const inSheet = within(sheet).getAllByRole("link");
    // Best offer per store (2) + every eBay listing in the tray (2).
    expect(inSheet).toHaveLength(4);
    inSheet.forEach(expectOutbound);
  });

  it("covers the direct store searches offered when every store is down", () => {
    renderView({
      response: response({
        groups: [],
        totalOffers: 0,
        isPartial: true,
        providers: [
          { provider: "amazon", status: "error", resultCount: 0, latencyMs: 1, fromCache: false },
          { provider: "ebay", status: "error", resultCount: 0, latencyMs: 1, fromCache: false },
        ],
      }),
      storeSearches: [
        { provider: "amazon", href: "/go/amazon%3Asearch%3Aq?d=a&s=b" },
        { provider: "ebay", href: "/go/ebay%3Asearch%3Aq?d=c&s=d" },
      ],
    });
    screen.getAllByRole("link", { name: /^Search (Amazon|eBay)$/ }).forEach(expectOutbound);
  });
});

describe("nextPageHref", () => {
  it("keeps the query, a non-default sort and every filter", () => {
    const href = nextPageHref(
      { ...QUERY, filters: { maxTotal: { amountMinor: 300_00, currency: "ILS" }, freeShippingOnly: true } },
      3,
    );
    expect(Object.fromEntries(new URL(href, "https://x.test").searchParams)).toEqual({
      q: "אוזניות אלחוטיות",
      sort: "landed_price_asc",
      max: "300",
      free: "1",
      page: "3",
    });
  });

  it("leaves the default sort out of the URL", () => {
    expect(nextPageHref({ ...QUERY, sort: "relevance" }, 2)).toBe(
      `/search?q=${encodeURIComponent("אוזניות אלחוטיות").replace(/%20/g, "+")}&page=2`,
    );
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

describe("ResultsView — dated prices", () => {
  const cached = (provider: ProviderId, cachedAt: string): ProviderOutcome => ({
    ...ok(provider),
    latencyMs: null,
    fromCache: true,
    cachedAt,
  });

  it("dates stores whose prices come from an older snapshot, oldest first", () => {
    renderView({
      response: response({
        providers: [
          ok("aliexpress"),
          // 20 minutes old: reads as current, not dated.
          cached("temu", "2026-10-11T08:40:00.000Z"),
          cached("ebay", "2026-10-11T03:00:00.000Z"),
          cached("amazon", "2026-10-09T07:30:00.000Z"),
        ],
      }),
    });
    const notice = screen.getByText(/Prices may have changed/).closest("p");
    expect(notice).toHaveTextContent(
      "Amazon prices as of 9 Oct, 10:30 · eBay prices as of 11 Oct, 06:00. Prices may have changed since",
    );
    expect(notice?.querySelector("time")).toHaveAttribute("dateTime", "2026-10-09T07:30:00.000Z");
    expect(notice).not.toHaveTextContent("Temu");
  });

  it("shows no date for live or fresh results", () => {
    renderView();
    expect(screen.queryByText(/Prices may have changed/)).not.toBeInTheDocument();
  });
});
