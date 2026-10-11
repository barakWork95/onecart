import { snapshotFromOffer } from "@/domain/user-lists/product-snapshot";
import { makeProduct } from "@/test/product-factory";

describe("snapshotFromOffer", () => {
  it("keeps only what the lists need, priced at the landed total", () => {
    const offer = makeProduct({ provider: "ebay", sku: "9", title: "Keychron K2", total: 168_00 });
    expect(snapshotFromOffer(offer, "mechanical keyboard")).toEqual({
      productId: "ebay:9",
      provider: "ebay",
      title: "Keychron K2",
      imageUrl: "https://img.example/9.jpg",
      productUrl: "https://ebay.example/item/9",
      price: offer.price.total,
      searchText: "mechanical keyboard",
    });
  });
});
