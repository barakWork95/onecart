import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import { heroImage, heroTitleListing } from "@/domain/search/hero-listing";
import { makeProduct } from "@/test/product-factory";

const listing = (sku: string, overrides: Parameters<typeof makeProduct>[0] = {}) =>
  makeProduct({
    provider: "ebay",
    sku,
    title: `Listing ${sku}`,
    imageUrl: `https://i.ebayimg.com/${sku}.jpg`,
    ...overrides,
  });

const amazonNoOffer = (imageUrl: string | null): UnavailableListing => ({
  id: "amazon:B09XS7JWHH",
  provider: "amazon",
  providerProductId: "B09XS7JWHH",
  title: "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
  productUrl: "https://www.amazon.com/dp/B09XS7JWHH",
  imageUrl,
  reason: "no_offer_to_destination",
});

// Listings arrive cheapest first, as groups store them.
const cheap = listing("cheap", { total: 900_00 });
const ranked = listing("ranked", { total: 1000_00 });
const reviewed = listing("reviewed", { total: 1100_00, rating: { average: 4.6, count: 900 } });
const rankOf = (id: string) => ({ "ebay:ranked": 0, "ebay:cheap": 7, "ebay:reviewed": 3 })[id];

describe("heroImage", () => {
  it("prefers a catalog store's photo: an Amazon listing in the group", () => {
    const amazon = makeProduct({
      provider: "amazon",
      sku: "z",
      imageUrl: "https://m.media-amazon.com/z.jpg",
      total: 1200_00,
    });
    expect(heroImage([cheap, ranked, amazon], [], rankOf)).toBe("https://m.media-amazon.com/z.jpg");
  });

  it("uses Amazon's catalog photo of the same product even when Amazon won't ship it", () => {
    expect(heroImage([cheap, ranked], [amazonNoOffer("https://m.media-amazon.com/xm5.jpg")], rankOf)).toBe(
      "https://m.media-amazon.com/xm5.jpg",
    );
  });

  it("otherwise takes the photo of the listing the store ranks best, not the cheapest", () => {
    expect(heroImage([cheap, ranked, reviewed], [], rankOf)).toBe("https://i.ebayimg.com/ranked.jpg");
    expect(heroImage([cheap, ranked, reviewed], [amazonNoOffer(null)], rankOf)).toBe(
      "https://i.ebayimg.com/ranked.jpg",
    );
  });

  it("without ranks, prefers the most-reviewed listing, then the cheapest", () => {
    expect(heroImage([cheap, ranked, reviewed], [])).toBe("https://i.ebayimg.com/reviewed.jpg");
    expect(heroImage([cheap, ranked], [])).toBe("https://i.ebayimg.com/cheap.jpg");
  });

  it("skips listings without a photo, and is null when none has one", () => {
    const noPhoto = listing("ranked", { imageUrl: null });
    expect(heroImage([cheap, noPhoto], [], rankOf)).toBe("https://i.ebayimg.com/cheap.jpg");
    expect(heroImage([listing("a", { imageUrl: null })], [])).toBeNull();
  });
});

describe("heroTitleListing", () => {
  it("takes the most-reviewed listing's title", () => {
    expect(heroTitleListing([cheap, ranked, reviewed], rankOf)).toBe(reviewed);
  });

  it("without reviews, takes the store's best match over the cheapest listing", () => {
    expect(heroTitleListing([cheap, ranked], rankOf)).toBe(ranked);
    expect(heroTitleListing([cheap, ranked])).toBe(cheap);
  });
});
