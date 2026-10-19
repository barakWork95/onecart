import { OUTBOUND_LINK, withLocale } from "@/components/features/outbound-link";

describe("withLocale", () => {
  it("adds the page's language to a Hebrew page's /go link, and leaves English links as signed", () => {
    expect(withLocale("/go/ebay%3A1?d=x&s=y", "he")).toBe("/go/ebay%3A1?d=x&s=y&l=he");
    expect(withLocale("/go/ebay%3A1?d=x&s=y", "en")).toBe("/go/ebay%3A1?d=x&s=y");
    // A fallback store URL (no signed link) is never touched.
    expect(withLocale("https://www.ebay.com/itm/1", "he")).toBe("https://www.ebay.com/itm/1");
  });

  it("keeps the outbound link attributes", () => {
    expect(OUTBOUND_LINK).toEqual({ target: "_blank", rel: "nofollow sponsored noopener noreferrer" });
  });
});
