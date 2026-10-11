import { signAliExpressParams } from "@/infrastructure/providers/aliexpress/aliexpress-signer";

describe("signAliExpressParams", () => {
  // Expected digests computed independently with Python's hashlib using the same scheme.
  it("matches the reference md5 signature (sorted keys, secret-wrapped, upper hex)", () => {
    const params = {
      method: "aliexpress.affiliate.product.query",
      app_key: "12345",
      timestamp: "1760140800000",
      keywords: "wireless earbuds",
    };
    expect(signAliExpressParams(params, "s3cr3t")).toBe("9A0730F908BF177BBF95CCD7E32B7D87");
  });

  it("is independent of insertion order", () => {
    const a = signAliExpressParams({ b: "2", a: "1" }, "k");
    const b = signAliExpressParams({ a: "1", b: "2" }, "k");
    expect(a).toBe(b);
  });

  it("hashes non-ASCII values as UTF-8", () => {
    expect(signAliExpressParams({ keywords: "אוזניות" }, "x")).toBe("B3B55AC23B9153503433CAA1CBE9FCB6");
  });
});
