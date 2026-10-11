import {
  discountPercent,
  fastestOfferId,
  outboundHref,
  premiumOverBest,
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
