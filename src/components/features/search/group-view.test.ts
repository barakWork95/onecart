import {
  discountPercent,
  fastestOfferId,
  findMatchesLink,
  outboundHref,
  premiumOverBest,
  storeComparison,
} from "@/components/features/search/group-view";
import { groupProducts } from "@/domain/search/product-group";
import { money } from "@/domain/shared/money";
import { makeProduct } from "@/test/product-factory";

const group = (...products: Parameters<typeof makeProduct>[0][]) => {
  const [g] = groupProducts(products.map((p) => makeProduct({ title: "Soundcore Life P3", ...p })));
  if (!g) throw new Error("expected a group");
  return g;
};

describe("discountPercent", () => {
  it("rounds the discount vs the strike-through price", () => {
    const offer = { ...makeProduct({ total: 89_00 }), originalPrice: money(143_55, "ILS") };
    expect(discountPercent(offer)).toBe(38);
  });

  it("is null without a higher original price", () => {
    expect(discountPercent(makeProduct())).toBeNull();
    expect(
      discountPercent({ ...makeProduct({ total: 100_00 }), originalPrice: money(100_00, "ILS") }),
    ).toBeNull();
  });
});

describe("fastestOfferId", () => {
  it("picks the strictly fastest offer", () => {
    const g = group(
      { provider: "aliexpress", sku: "a", total: 89_00, deliveryDays: [10, 12] },
      { provider: "amazon", sku: "z", total: 142_00, deliveryDays: [4, 4] },
    );
    expect(fastestOfferId(g)).toBe("amazon:z");
  });

  it("is null on ties, unknown times, or single-store groups", () => {
    expect(
      fastestOfferId(
        group(
          { provider: "aliexpress", sku: "a", deliveryDays: [3, 5] },
          { provider: "amazon", sku: "z", total: 101_00, deliveryDays: [5, 5] },
        ),
      ),
    ).toBeNull();
    expect(fastestOfferId(group({ provider: "amazon", sku: "z", deliveryDays: [1, 2] }))).toBeNull();
    expect(
      fastestOfferId(
        group({ provider: "aliexpress", sku: "a" }, { provider: "amazon", sku: "z", total: 101_00 }),
      ),
    ).toBeNull();
  });

  it("works when only one offer has a delivery estimate", () => {
    const g = group(
      { provider: "aliexpress", sku: "a" },
      { provider: "amazon", sku: "z", total: 101_00, deliveryDays: [null, 6] },
    );
    expect(fastestOfferId(g)).toBe("amazon:z");
  });
});

describe("premiumOverBest", () => {
  it("is zero for the best offer and the difference for others", () => {
    const g = group(
      { provider: "aliexpress", sku: "a", total: 89_00 },
      { provider: "temu", sku: "t", total: 98_00 },
    );
    expect(premiumOverBest(g, g.offers[0])).toEqual(money(0, "ILS"));
    expect(g.offers[1] && premiumOverBest(g, g.offers[1])).toEqual(money(9_00, "ILS"));
  });
});

describe("outboundHref", () => {
  it("uses the signed /go link when present and the clean URL otherwise", () => {
    const offer = makeProduct({ provider: "amazon", sku: "z" });
    expect(outboundHref({ "amazon:z": "/go/amazon%3Az?d=1&s=2" }, offer)).toBe("/go/amazon%3Az?d=1&s=2");
    expect(outboundHref({}, offer)).toBe("https://amazon.example/item/z");
  });
});

describe("storeComparison", () => {
  it("lists every store's landed total, cheapest first, and names the best deal", () => {
    const g = group(
      { provider: "ebay", sku: "e", total: 276_00 },
      { provider: "amazon", sku: "a", total: 244_40 },
    );
    expect(storeComparison(g)).toEqual({
      headline: "Available on 2 stores",
      prices: "Amazon ₪244 vs eBay ₪276",
      bestDeal: "Best deal on Amazon",
    });
  });

  it("names three stores and counts the rest", () => {
    const g = group(
      { provider: "aliexpress", sku: "1", total: 89_00 },
      { provider: "temu", sku: "2", total: 98_00 },
      { provider: "amazon", sku: "3", total: 142_00 },
      { provider: "ebay", sku: "4", total: 153_00 },
    );
    expect(storeComparison(g)?.prices).toBe("AliExpress ₪89 vs Temu ₪98 vs Amazon ₪142 +1 more");
  });

  it("is null for a single store", () => {
    expect(storeComparison(group({ provider: "ebay" }))).toBeNull();
  });
});

describe("findMatchesLink", () => {
  const sony = () =>
    group({
      provider: "ebay",
      title: "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones, Sound, Lightweight Design",
    });

  it("searches the item's core title, named after the one other store", () => {
    expect(findMatchesLink(sony(), ["amazon", "ebay"], "headphones")).toEqual({
      href: "/search?q=Sony+WH-CH520+Wireless+Bluetooth+On-Ear+Headphones",
      label: "Find on Amazon",
    });
  });

  it("says “other stores” when several are connected", () => {
    expect(findMatchesLink(sony(), ["amazon", "ebay", "aliexpress"], "headphones")?.label).toBe(
      "Find on other stores",
    );
  });

  it("is null without another store, or when that search is already on screen", () => {
    expect(findMatchesLink(sony(), ["ebay"], "headphones")).toBeNull();
    expect(
      findMatchesLink(sony(), ["amazon", "ebay"], "sony wh-ch520 wireless bluetooth on-ear  headphones"),
    ).toBeNull();
  });
});

describe("storeComparison / findMatchesLink — a store that won't ship", () => {
  const amazonNoOffer = {
    id: "amazon:B09XS7JWHH",
    provider: "amazon" as const,
    providerProductId: "B09XS7JWHH",
    title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
    productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
    imageUrl: null,
    reason: "no_offer_to_destination" as const,
  };
  const ebayOnly = () => ({
    ...group({ provider: "ebay", sku: "e", title: "Sony WH-1000XM5 Headphones Black", total: 1066_00 }),
    unavailable: [amazonNoOffer],
  });

  it("compares one priced store with one that has no offer to Israel", () => {
    expect(storeComparison(ebayOnly())).toEqual({
      headline: "Compared on 2 stores",
      prices: "eBay ₪1,066 vs Amazon: no offer to Israel",
      bestDeal: "Only eBay ships it to Israel",
    });
  });

  it("doesn't suggest finding it on a store already known not to ship it", () => {
    expect(findMatchesLink(ebayOnly(), ["amazon", "ebay"], "headphones")).toBeNull();
  });
});
