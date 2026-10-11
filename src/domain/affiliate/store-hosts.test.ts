import { parseAllowedStoreUrl } from "@/domain/affiliate/store-hosts";

describe("parseAllowedStoreUrl", () => {
  it.each([
    ["amazon", "https://www.amazon.com/dp/B08KW1KR5H"],
    ["amazon", "https://amazon.com/s?k=earbuds"],
    ["aliexpress", "https://www.aliexpress.com/item/1005006271234567.html"],
    ["aliexpress", "https://s.click.aliexpress.com/e/_abc"],
    ["aliexpress", "https://www.aliexpress.us/item/1.html"],
    ["temu", "https://www.temu.com/search_result.html?search_key=x"],
    ["ebay", "https://www.ebay.com/itm/395012345678"],
    ["ebay", "https://WWW.EBAY.COM/itm/1"],
    ["amazon", "https://www.amazon.com./dp/B08KW1KR5H"],
  ] as const)("allows %s → %s", (provider, url) => {
    expect(parseAllowedStoreUrl(provider, url)).toBeInstanceOf(URL);
  });

  it.each([
    ["another store's domain", "amazon", "https://www.ebay.com/itm/1"],
    ["a look-alike suffix", "amazon", "https://evilamazon.com/dp/1"],
    ["a look-alike subdomain", "amazon", "https://amazon.com.evil.io/dp/1"],
    ["credentials tricking the host", "amazon", "https://amazon.com@evil.io/dp/1"],
    ["user and password", "ebay", "https://user:pass@www.ebay.com/itm/1"],
    ["plain http", "amazon", "http://www.amazon.com/dp/1"],
    ["a custom port", "amazon", "https://www.amazon.com:8443/dp/1"],
    ["javascript:", "amazon", "javascript:alert(1)//amazon.com"],
    ["a data URL", "temu", "data:text/html,<script>alert(1)</script>"],
    ["a relative URL", "temu", "/search_result.html"],
    ["protocol-relative", "temu", "//evil.io/temu.com"],
    ["garbage", "temu", "not a url"],
    ["a non-amazon country domain (not yet supported)", "amazon", "https://www.amazon.de/dp/1"],
  ] as const)("rejects %s", (_label, provider, url) => {
    expect(parseAllowedStoreUrl(provider, url)).toBeNull();
  });
});
