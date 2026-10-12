import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { money } from "@/domain/shared/money";
import { PROVIDER_IDS } from "@/domain/shared/provider";
import { DEMO_CATALOG, DEMO_FX } from "@/infrastructure/providers/demo/demo-catalog";
import { createDemoProvider, DEMO_STORE_PAGE_SIZE } from "@/infrastructure/providers/demo/demo-provider";

const query = (normalizedText: string): SearchQuery => ({
  rawText: normalizedText,
  detectedLanguage: "en",
  normalizedText,
  sort: "landed_price_asc",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
});

const provider = (id: (typeof PROVIDER_IDS)[number]) =>
  createDemoProvider({
    provider: id,
    catalog: DEMO_CATALOG,
    policy: ISRAEL_IMPORT_POLICY,
    fx: DEMO_FX,
    now: () => new Date("2026-10-11T09:00:00.000Z"),
  });

const search = async (id: (typeof PROVIDER_IDS)[number], text: string) => {
  const result = await provider(id).search(query(text), { signal: new AbortController().signal });
  if (!result.ok) throw new Error("demo provider must not fail");
  return result.value.products;
};

describe("createDemoProvider", () => {
  it("returns only its own store's listings matching every query word (plural-insensitive)", async () => {
    const ali = await search("aliexpress", "wireless earbud");
    expect(ali.map((p) => p.title)).toEqual([
      "SoundCore Life P3 ANC Wireless Earbuds",
      "Baseus Bowie M2+ Wireless Earbuds ANC",
      "Soundcore Space A40 ANC Wireless Earbuds",
    ]);
    expect(ali.every((p) => p.provider === "aliexpress")).toBe(true);
  });

  it("prices listings through the landed-price calculator", async () => {
    const [p3] = await search("amazon", "soundcore life p3");
    // ($29.99 + $8.40) × 3.7, under the $75 exemption → no tax
    expect(p3?.price).toMatchObject({
      total: money(142_04, "ILS"),
      importVat: money(0, "ILS"),
      shippingKnown: true,
    });

    const [sony] = await search("amazon", "sony headphones");
    expect(sony?.price).toMatchObject({ taxesCollectedAtCheckout: true, importVat: money(67_93, "ILS") });
  });

  it("fills in delivery, discount, and store search URL", async () => {
    const [p3] = await search("aliexpress", "life p3");
    expect(p3).toMatchObject({
      id: "aliexpress:1005006271234567",
      delivery: {
        minDays: 10,
        maxDays: 12,
        isFreeShipping: true,
        methodLabel: "AliExpress Standard Shipping",
      },
      originalPrice: money(143_55, "ILS"),
      productUrl:
        "https://www.aliexpress.com/wholesale?SearchText=SoundCore%20Life%20P3%20ANC%20Wireless%20Earbuds",
      fetchedAt: "2026-10-11T09:00:00.000Z",
    });
  });

  it("matches by tokens: any word order, extra words in the title, singular or plural", async () => {
    const forward = (await search("amazon", "noise cancelling headphones")).map((p) => p.id);
    const reversed = (await search("amazon", "headphone cancelling noise")).map((p) => p.id);
    expect(forward).toContain("amazon:B0BS1QCFHX"); // "Sony WH-CH720N Noise Canceling Wireless Headphones"
    expect(reversed).toEqual(forward);
  });

  it("returns nothing for unmatched or empty queries", async () => {
    expect(await search("temu", "espresso machine")).toEqual([]);
    expect(await search("temu", "   ")).toEqual([]);
  });

  it("links each store to its own search page", async () => {
    for (const id of PROVIDER_IDS) {
      const results = await search(id, "earbuds");
      expect(results.length).toBeGreaterThan(0);
      expect(new URL(results[0]?.productUrl ?? "").hostname).toMatch(
        new RegExp(id === "aliexpress" ? "aliexpress" : id),
      );
    }
  });

  it("marks unquoted shipping as unknown", async () => {
    const ebayListing = DEMO_CATALOG.find((l) => l.provider === "ebay");
    if (!ebayListing) throw new Error("catalog needs an eBay listing");
    const custom = createDemoProvider({
      provider: "ebay",
      catalog: [{ ...ebayListing, shipping: null }],
      policy: ISRAEL_IMPORT_POLICY,
      fx: DEMO_FX,
    });
    const result = await custom.search(query("earbuds"), { signal: new AbortController().signal });
    expect(result.ok && result.value.products[0]?.price.shippingKnown).toBe(false);
    expect(result.ok && result.value.products[0]?.delivery.isFreeShipping).toBeNull();
  });
});

describe("createDemoProvider — store pages", () => {
  it("serves matches in pages and says when more exist", async () => {
    const signal = new AbortController().signal;
    const amazon = provider("amazon");
    const first = await amazon.search(query("usb cable"), { signal });
    const second = await amazon.search(query("usb cable"), { signal, storePage: 2 });
    expect(first.ok && first.value).toMatchObject({ hasMore: true });
    expect(first.ok && first.value.products).toHaveLength(DEMO_STORE_PAGE_SIZE);
    expect(second.ok && second.value.hasMore).toBe(false);
    expect(second.ok && second.value.products).toHaveLength(30 - DEMO_STORE_PAGE_SIZE);
  });
});
