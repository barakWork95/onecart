import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { money } from "@/domain/shared/money";
import { mapAmazonProduct, type AmazonMapContext } from "@/infrastructure/providers/amazon/amazon-mapper";
import type { AmazonRawProduct } from "@/infrastructure/providers/amazon/amazon-raw-schema";
import { TEST_FX } from "@/test/fx";

const NOW = new Date("2026-10-11T09:00:00.000Z");
const ctx: AmazonMapContext = {
  policy: ISRAEL_IMPORT_POLICY,
  fx: TEST_FX,
  now: NOW,
  fetchedAt: NOW.toISOString(),
};
const ils = (agorot: number) => money(agorot, "ILS");

const raw = (overrides: Partial<AmazonRawProduct> = {}): AmazonRawProduct => ({
  asin: "B08KW1KR5H",
  title: "Soundcore by Anker Life P3 Noise Cancelling Earbuds",
  price: "$29.99",
  extracted_price: 29.99,
  delivery: ["$8.40 delivery Thu, Oct 15"],
  ...overrides,
});

describe("mapAmazonProduct", () => {
  it("normalizes a typical listing into a UnifiedProduct", () => {
    const product = mapAmazonProduct(
      raw({
        title: "  Soundcore by Anker  Life P3 ",
        thumbnail: "https://m.media-amazon.com/images/I/61.jpg",
        rating: 4.5,
        reviews: 3150,
      }),
      ctx,
    );
    expect(product).toEqual({
      id: "amazon:B08KW1KR5H",
      provider: "amazon",
      providerProductId: "B08KW1KR5H",
      title: "Soundcore by Anker Life P3",
      imageUrl: "https://m.media-amazon.com/images/I/61.jpg",
      productUrl: "https://www.amazon.com/dp/B08KW1KR5H",
      price: {
        item: ils(110_96),
        shipping: ils(31_08),
        shippingKnown: true,
        importVat: ils(0),
        customsDuty: ils(0),
        fees: ils(0),
        total: ils(142_04),
        taxesCollectedAtCheckout: false,
        listed: money(29_99, "USD"),
        fxRate: 3.7,
      },
      originalPrice: null,
      rating: { average: 4.5, count: 3150 },
      delivery: { minDays: 4, maxDays: 4, isFreeShipping: false, methodLabel: null },
      availability: "in_stock",
      sellerName: null,
      fetchedAt: "2026-10-11T09:00:00.000Z",
    });
  });

  it("estimates VAT on item + shipping above the $75 exemption and keeps the strike-through price", () => {
    const product = mapAmazonProduct(
      raw({
        price: "$89.99",
        extracted_price: 89.99,
        extracted_old_price: 149.99,
        delivery: ["$12.00 delivery Mon, Oct 19"],
      }),
      ctx,
    );
    expect(product?.price).toMatchObject({ importVat: ils(67_92), total: ils(445_28) });
    expect(product?.originalPrice).toEqual(ils(554_96));
  });

  it("estimates no extra tax when the quoted amount includes Amazon's import fees deposit", () => {
    const product = mapAmazonProduct(
      raw({
        price: "$159.99",
        extracted_price: 159.99,
        delivery: ["$31.42 shipping & import fees deposit to Israel"],
      }),
      ctx,
    );
    expect(product?.price).toMatchObject({
      importVat: ils(0),
      taxesCollectedAtCheckout: true,
      total: ils(708_21),
    });
  });

  it("marks shipping unknown when the free-delivery threshold isn't met", () => {
    const product = mapAmazonProduct(
      raw({ delivery: ["FREE delivery Wed, Oct 21 on $35 of items shipped by Amazon"] }),
      ctx,
    );
    expect(product?.price).toMatchObject({ shippingKnown: false, total: ils(110_96) });
    expect(product?.delivery.isFreeShipping).toBeNull();
  });

  it("reads non-USD display prices", () => {
    expect(mapAmazonProduct(raw({ price: "₪110.00", extracted_price: 110 }), ctx)?.price.listed).toEqual(
      ils(110_00),
    );
    expect(mapAmazonProduct(raw({ price: "ILS 110.00", extracted_price: 110 }), ctx)?.price.listed).toEqual(
      ils(110_00),
    );
    expect(mapAmazonProduct(raw({ price: "€20.00", extracted_price: 20 }), ctx)?.price.listed).toEqual(
      money(20_00, "EUR"),
    );
    expect(mapAmazonProduct(raw({ price: "£20.00", extracted_price: 20 }), ctx)?.price.listed).toEqual(
      money(20_00, "GBP"),
    );
  });

  it("ignores a strike-through price that isn't higher", () => {
    expect(mapAmazonProduct(raw({ extracted_old_price: 29.99 }), ctx)?.originalPrice).toBeNull();
  });

  it("omits ratings without reviews and non-https or invalid thumbnails", () => {
    const product = mapAmazonProduct(
      raw({ rating: 5, reviews: 0, thumbnail: "http://insecure.example/x.jpg" }),
      ctx,
    );
    expect(product).toMatchObject({ rating: null, imageUrl: null });
    expect(mapAmazonProduct(raw({ thumbnail: "not a url" }), ctx)?.imageUrl).toBeNull();
  });

  it.each<[string, Partial<AmazonRawProduct>]>([
    ["no display price", { price: undefined }],
    ["no numeric price", { extracted_price: undefined }],
    ["unknown currency", { price: "¥3000" }],
    ["blank title", { title: "   " }],
  ])("returns null for %s", (_label, overrides) => {
    expect(mapAmazonProduct(raw(overrides), ctx)).toBeNull();
  });
});
