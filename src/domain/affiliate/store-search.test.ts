import { parseAllowedStoreUrl } from "@/domain/affiliate/store-hosts";
import { storeSearchUrl } from "@/domain/affiliate/store-search";

describe("storeSearchUrl", () => {
  it("builds the store's search page, encoded, on an allowlisted host", () => {
    const amazon = storeSearchUrl("amazon", "Sony WH-1000XM5 Wireless Headphones & Case");
    expect(amazon).toBe("https://www.amazon.com/s?k=Sony+WH-1000XM5+Wireless+Headphones+%26+Case");
    expect(amazon && parseAllowedStoreUrl("amazon", amazon)).not.toBeNull();
    const ebay = storeSearchUrl("ebay", "jbl flip 6");
    expect(ebay).toBe("https://www.ebay.com/sch/i.html?_nkw=jbl+flip+6");
    expect(ebay && parseAllowedStoreUrl("ebay", ebay)).not.toBeNull();
  });

  it("is null for an empty query or a store without a search link", () => {
    expect(storeSearchUrl("amazon", "  ")).toBeNull();
    expect(storeSearchUrl("temu", "earbuds")).toBeNull();
  });
});
