import { isFeaturableListing, isTypicalPrice, medianAmount } from "@/domain/deals/featured-listing";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { searchIntent } from "@/domain/search/search-intent";
import { makeProduct, type ProductSpec } from "@/test/product-factory";

const featurable = (spec: ProductSpec, query: string) => {
  const product = makeProduct(spec);
  return isFeaturableListing(product, tokenizeTitle(product.title), searchIntent(query));
};

describe("isFeaturableListing", () => {
  it("needs a branded query's brand in marketplace titles, not in catalog titles", () => {
    expect(featurable({ provider: "ebay", title: "Apple AirTag Tracker" }, "apple airtag")).toBe(true);
    expect(featurable({ provider: "ebay", title: "AirTag Compatible Tracker" }, "apple airtag")).toBe(false);
    expect(featurable({ provider: "amazon", title: "AirTag 4 Pack" }, "apple airtag")).toBe(true);
    // An unbranded query has no brand to require.
    expect(featurable({ provider: "ebay", title: "Memory Foam Pillow" }, "memory foam pillow")).toBe(true);
  });

  it("refuses branded AliExpress listings from non-official stores", () => {
    const title = "JBL Go 4 Portable Speaker";
    expect(featurable({ provider: "aliexpress", title, sellerName: "Music Store" }, "jbl go 4")).toBe(false);
    expect(featurable({ provider: "aliexpress", title, sellerName: "JBL Official Store" }, "jbl go 4")).toBe(
      true,
    );
  });
});

describe("featured price band", () => {
  it("takes the median of odd and even counts, null for none", () => {
    expect(medianAmount([300, 100, 200])).toBe(200);
    expect(medianAmount([400, 100, 200, 300])).toBe(250);
    expect(medianAmount([])).toBeNull();
  });

  it("keeps prices from half to twice the typical one, inclusive", () => {
    expect(isTypicalPrice(50, 100)).toBe(true);
    expect(isTypicalPrice(200, 100)).toBe(true);
    expect(isTypicalPrice(49, 100)).toBe(false);
    expect(isTypicalPrice(201, 100)).toBe(false);
  });
});
