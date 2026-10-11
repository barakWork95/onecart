import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { money } from "@/domain/shared/money";
import {
  mapAliExpressProduct,
  type AliExpressMapContext,
} from "@/infrastructure/providers/aliexpress/aliexpress-mapper";
import type { AliExpressRawProduct } from "@/infrastructure/providers/aliexpress/aliexpress-raw-schema";
import { TEST_FX } from "@/test/fx";

const ctx: AliExpressMapContext = {
  policy: ISRAEL_IMPORT_POLICY,
  fx: TEST_FX,
  fetchedAt: "2026-10-11T09:00:00.000Z",
  pricesIncludeImportVat: false,
};

const raw = (overrides: Partial<AliExpressRawProduct> = {}): AliExpressRawProduct => ({
  product_id: 1005006271234567,
  product_title: "SoundCore Life P3",
  product_detail_url: "https://www.aliexpress.com/item/1005006271234567.html",
  target_sale_price: "89.00",
  target_sale_price_currency: "ILS",
  ...overrides,
});

const ils = (agorot: number) => money(agorot, "ILS");

describe("mapAliExpressProduct", () => {
  it("normalizes a typical ILS listing into a UnifiedProduct", () => {
    const product = mapAliExpressProduct(
      raw({
        product_title: "  SoundCore \n Life   P3  ",
        product_main_image_url: "//ae01.alicdn.com/kf/S1.jpg",
        target_original_price: "143.55",
        target_original_price_currency: "ILS",
        shop_name: " Soundcore Official Store ",
      }),
      ctx,
    );

    expect(product).toEqual({
      id: "aliexpress:1005006271234567",
      provider: "aliexpress",
      providerProductId: "1005006271234567",
      title: "SoundCore Life P3",
      imageUrl: "https://ae01.alicdn.com/kf/S1.jpg",
      productUrl: "https://www.aliexpress.com/item/1005006271234567.html",
      price: {
        item: ils(89_00),
        shipping: ils(0),
        shippingKnown: false,
        importVat: ils(0),
        customsDuty: ils(0),
        fees: ils(0),
        total: ils(89_00),
        taxesCollectedAtCheckout: false,
        listed: ils(89_00),
        fxRate: 1,
      },
      originalPrice: ils(143_55),
      rating: null,
      delivery: { minDays: null, maxDays: null, isFreeShipping: null, methodLabel: null },
      availability: "in_stock",
      sellerName: "Soundcore Official Store",
      fetchedAt: "2026-10-11T09:00:00.000Z",
    });
  });

  it("estimates 18% VAT for items over the $75 exemption", () => {
    const product = mapAliExpressProduct(raw({ target_sale_price: "329.90" }), ctx);
    expect(product?.price).toMatchObject({ importVat: ils(59_38), total: ils(389_28) });
  });

  it("trusts tax-inclusive pricing when configured, adding no VAT estimate", () => {
    const product = mapAliExpressProduct(raw({ target_sale_price: "329.90" }), {
      ...ctx,
      pricesIncludeImportVat: true,
    });
    expect(product?.price).toMatchObject({
      importVat: ils(0),
      total: ils(329_90),
      taxesCollectedAtCheckout: true,
    });
  });

  it("converts non-ILS listings and keeps the listed price and FX rate", () => {
    const product = mapAliExpressProduct(
      raw({ target_sale_price: "12.50", target_sale_price_currency: "usd" }),
      ctx,
    );
    expect(product?.price).toMatchObject({ listed: money(12_50, "USD"), fxRate: 3.7, total: ils(46_25) });
  });

  it("strips tracking/affiliate params and fragments from the product URL", () => {
    const product = mapAliExpressProduct(
      raw({
        product_detail_url: "http://www.aliexpress.com/item/1005006271234567.html?spm=x&aff_fcid=y#reviews",
      }),
      ctx,
    );
    expect(product?.productUrl).toBe("https://www.aliexpress.com/item/1005006271234567.html");
  });

  it("takes the product id from the URL to avoid JSON number precision loss", () => {
    const product = mapAliExpressProduct(
      raw({ product_id: 1, product_detail_url: "https://www.aliexpress.com/item/1005006999999999.html" }),
      ctx,
    );
    expect(product?.providerProductId).toBe("1005006999999999");
  });

  it("falls back to product_id when the URL has no item id", () => {
    const product = mapAliExpressProduct(
      raw({ product_id: "42", product_detail_url: "https://s.aliexpress.com/abc" }),
      ctx,
    );
    expect(product?.id).toBe("aliexpress:42");
  });

  it("drops a strike-through price that isn't higher than the sale price", () => {
    expect(mapAliExpressProduct(raw({ target_original_price: "80.00" }), ctx)?.originalPrice).toBeNull();
    expect(mapAliExpressProduct(raw({ target_original_price: "89.00" }), ctx)?.originalPrice).toBeNull();
  });

  it("converts a strike-through price quoted in another currency", () => {
    const product = mapAliExpressProduct(
      raw({ target_original_price: "30.00", target_original_price_currency: "USD" }),
      ctx,
    );
    expect(product?.originalPrice).toEqual(ils(111_00));
  });

  it("ignores a strike-through price in an unsupported currency", () => {
    const product = mapAliExpressProduct(
      raw({ target_original_price: "9999", target_original_price_currency: "RUB" }),
      ctx,
    );
    expect(product?.originalPrice).toBeNull();
  });

  it("treats a blank shop name and missing image as null", () => {
    const product = mapAliExpressProduct(raw({ shop_name: "   " }), ctx);
    expect(product).toMatchObject({ sellerName: null, imageUrl: null });
  });

  it("nulls an image URL that can't be parsed instead of failing the product", () => {
    expect(mapAliExpressProduct(raw({ product_main_image_url: "not a url" }), ctx)?.imageUrl).toBeNull();
  });

  it.each<[string, Partial<AliExpressRawProduct>]>([
    ["unsupported currency", { target_sale_price_currency: "RUB" }],
    ["zero price", { target_sale_price: "0.00" }],
    ["unparseable URL", { product_detail_url: "not a url" }],
    ["non-http URL", { product_detail_url: "javascript:alert(1)" }],
    ["whitespace-only title", { product_title: "   " }],
  ])("returns null for %s", (_label, overrides) => {
    expect(mapAliExpressProduct(raw(overrides), ctx)).toBeNull();
  });
});
