import { unifiedProductId } from "@/domain/product/unified-product";

describe("unifiedProductId", () => {
  it("namespaces the provider id so ids never collide across stores", () => {
    expect(unifiedProductId("amazon", "B0C1234567")).toBe("amazon:B0C1234567");
    expect(unifiedProductId("ebay", "123")).not.toBe(unifiedProductId("temu", "123"));
  });
});
