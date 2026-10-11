import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { money } from "@/domain/shared/money";
import { mapEbayItem, type EbayMapContext } from "@/infrastructure/providers/ebay/ebay-mapper";
import type { EbayRawItem } from "@/infrastructure/providers/ebay/ebay-raw-schema";
import { TEST_FX } from "@/test/fx";

const NOW = new Date("2026-10-11T09:00:00.000Z"); // Sunday
const ctx: EbayMapContext = {
  policy: ISRAEL_IMPORT_POLICY,
  fx: TEST_FX,
  now: NOW,
  fetchedAt: NOW.toISOString(),
};
const ils = (agorot: number) => money(agorot, "ILS");
const usd = (value: string) => ({ value, currency: "USD" });

const raw = (overrides: Partial<EbayRawItem> = {}): EbayRawItem => ({
  itemId: "v1|395012345678|0",
  legacyItemId: "395012345678",
  title: "Soundcore Life P3 Earbuds",
  price: usd("34.50"),
  shippingOptions: [
    {
      shippingCostType: "FIXED",
      shippingCost: usd("6.90"),
      minEstimatedDeliveryDate: "2026-10-25T07:00:00.000Z",
      maxEstimatedDeliveryDate: "2026-10-29T07:00:00.000Z",
    },
  ],
  buyingOptions: ["FIXED_PRICE"],
  ...overrides,
});

describe("mapEbayItem", () => {
  it("normalizes a typical Buy It Now listing", () => {
    const product = mapEbayItem(
      raw({
        title: " Soundcore  Life P3 Earbuds ",
        image: { imageUrl: "https://i.ebayimg.com/images/g/x/s-l225.jpg" },
        marketingPrice: { originalPrice: usd("49.99") },
        seller: { username: "techdeals_us" },
      }),
      ctx,
    );
    expect(product).toEqual({
      id: "ebay:395012345678",
      provider: "ebay",
      providerProductId: "395012345678",
      title: "Soundcore Life P3 Earbuds",
      imageUrl: "https://i.ebayimg.com/images/g/x/s-l225.jpg",
      productUrl: "https://www.ebay.com/itm/395012345678",
      price: {
        item: ils(127_65),
        shipping: ils(25_53),
        shippingKnown: true,
        importVat: ils(0),
        customsDuty: ils(0),
        fees: ils(0),
        total: ils(153_18),
        taxesCollectedAtCheckout: false,
        listed: money(34_50, "USD"),
        fxRate: 3.7,
      },
      originalPrice: ils(184_96),
      rating: null,
      delivery: { minDays: 10, maxDays: 14, isFreeShipping: false, methodLabel: null },
      availability: "in_stock",
      sellerName: "techdeals_us",
      fetchedAt: "2026-10-11T09:00:00.000Z",
    });
  });

  it("picks the cheapest shipping option that quotes a cost, and its delivery window", () => {
    const product = mapEbayItem(
      raw({
        price: usd("79.00"),
        shippingOptions: [
          { shippingCostType: "CALCULATED" },
          {
            shippingCostType: "FIXED",
            shippingCost: usd("22.00"),
            maxEstimatedDeliveryDate: "2026-10-16T07:00:00.000Z",
          },
          {
            shippingCostType: "FIXED",
            shippingCost: usd("15.00"),
            minEstimatedDeliveryDate: "2026-10-20T07:00:00.000Z",
            maxEstimatedDeliveryDate: "2026-10-23T07:00:00.000Z",
          },
        ],
      }),
      ctx,
    );
    // $79 > $75: VAT 18% on CIF (₪292.30 + ₪55.50) = ₪62.60
    expect(product?.price).toMatchObject({ shipping: ils(55_50), importVat: ils(62_60), total: ils(410_40) });
    expect(product?.delivery).toMatchObject({ minDays: 7, maxDays: 10 });
  });

  it("uses a single known delivery date for both ends of the window", () => {
    const onlyMax = mapEbayItem(
      raw({
        shippingOptions: [
          { shippingCost: usd("1.00"), maxEstimatedDeliveryDate: "2026-10-16T07:00:00.000Z" },
        ],
      }),
      ctx,
    );
    expect(onlyMax?.delivery).toMatchObject({ minDays: 5, maxDays: 5 });
    const onlyMin = mapEbayItem(
      raw({
        shippingOptions: [
          { shippingCost: usd("1.00"), minEstimatedDeliveryDate: "2026-10-16T07:00:00.000Z" },
        ],
      }),
      ctx,
    );
    expect(onlyMin?.delivery).toMatchObject({ minDays: 5, maxDays: 5 });
  });

  it("treats a zero shipping cost as free", () => {
    const product = mapEbayItem(
      raw({ shippingOptions: [{ shippingCostType: "FIXED", shippingCost: usd("0.00") }] }),
      ctx,
    );
    expect(product?.delivery).toMatchObject({ isFreeShipping: true, minDays: null, maxDays: null });
    expect(product?.price.shippingKnown).toBe(true);
  });

  it("marks shipping unknown when no option quotes a cost", () => {
    for (const shippingOptions of [undefined, [], [{ shippingCostType: "CALCULATED" }]]) {
      const product = mapEbayItem(raw({ shippingOptions }), ctx);
      expect(product?.price).toMatchObject({ shippingKnown: false, total: ils(127_65) });
      expect(product?.delivery.isFreeShipping).toBeNull();
    }
  });

  it("compares shipping options in a common currency", () => {
    const product = mapEbayItem(
      raw({
        shippingOptions: [
          { shippingCost: { value: "5.00", currency: "EUR" } },
          { shippingCost: usd("5.00") },
        ],
      }),
      ctx,
    );
    expect(product?.price.shipping).toEqual(ils(18_50)); // $5 = ₪18.50 < €5 = ₪20
  });

  it("derives ids from the RESTful itemId and keeps variations unique", () => {
    expect(mapEbayItem(raw({ legacyItemId: undefined, itemId: "v1|395000000001|0" }), ctx)?.id).toBe(
      "ebay:395000000001",
    );
    const variation = mapEbayItem(
      raw({ itemId: "v1|395011112222|601234567890", legacyItemId: "395011112222" }),
      ctx,
    );
    expect(variation).toMatchObject({
      id: "ebay:395011112222-601234567890",
      productUrl: "https://www.ebay.com/itm/395011112222",
    });
  });

  it("ignores strike-through prices that aren't higher, or in unknown currencies", () => {
    expect(
      mapEbayItem(raw({ marketingPrice: { originalPrice: usd("30.00") } }), ctx)?.originalPrice,
    ).toBeNull();
    expect(
      mapEbayItem(raw({ marketingPrice: { originalPrice: { value: "99", currency: "JPY" } } }), ctx)
        ?.originalPrice,
    ).toBeNull();
  });

  it("drops non-https or invalid images", () => {
    expect(mapEbayItem(raw({ image: { imageUrl: "http://i.ebayimg.com/x.jpg" } }), ctx)?.imageUrl).toBeNull();
    expect(mapEbayItem(raw({ image: { imageUrl: "nope" } }), ctx)?.imageUrl).toBeNull();
  });

  it("accepts listings without buyingOptions", () => {
    expect(mapEbayItem(raw({ buyingOptions: undefined }), ctx)).not.toBeNull();
  });

  it.each<[string, Partial<EbayRawItem>]>([
    ["auction-only", { buyingOptions: ["AUCTION"] }],
    ["unsupported currency", { price: { value: "5000", currency: "JPY" } }],
    ["zero price", { price: usd("0.00") }],
    ["blank title", { title: "  " }],
    ["unparseable id", { legacyItemId: undefined, itemId: "weird-id" }],
  ])("returns null for %s", (_label, overrides) => {
    expect(mapEbayItem(raw(overrides), ctx)).toBeNull();
  });
});
