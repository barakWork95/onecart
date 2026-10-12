import { createSearchProducts } from "@/application/search/search-products";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { bestOffer, type ProductGroup } from "@/domain/search/product-group";
import type { SearchQuery, SearchSort } from "@/domain/search/search-query";
import { ok } from "@/domain/shared/result";
import {
  createInMemoryCircuitBreakerStore,
  createInMemorySearchCache,
} from "@/infrastructure/cache/in-memory-stores";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import airpodsAmazon1 from "@/infrastructure/providers/amazon/fixtures/recorded-airpods-pro.json";
import airpodsAmazon2 from "@/infrastructure/providers/amazon/fixtures/recorded-airpods-pro-p2.json";
import instantAmazon1 from "@/infrastructure/providers/amazon/fixtures/recorded-instant-pot-duo.json";
import instantAmazon2 from "@/infrastructure/providers/amazon/fixtures/recorded-instant-pot-duo-p2.json";
import jblAmazon1 from "@/infrastructure/providers/amazon/fixtures/recorded-jbl-flip-6.json";
import jblAmazon2 from "@/infrastructure/providers/amazon/fixtures/recorded-jbl-flip-6-p2.json";
import xm5Amazon1 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5.json";
import xm5Amazon2 from "@/infrastructure/providers/amazon/fixtures/recorded-sony-wh-1000xm5-p2.json";
import { createEbayProvider } from "@/infrastructure/providers/ebay/ebay-adapter";
import airpodsEbay from "@/infrastructure/providers/ebay/fixtures/recorded-airpods-pro.json";
import instantEbay from "@/infrastructure/providers/ebay/fixtures/recorded-instant-pot-duo.json";
import jblEbay from "@/infrastructure/providers/ebay/fixtures/recorded-jbl-flip-6.json";
import xm5Ebay from "@/infrastructure/providers/ebay/fixtures/recorded-sony-wh-1000xm5.json";
import { TEST_FX } from "@/test/fx";

/**
 * Live Amazon + eBay responses (recorded 2026-10-12) through the real adapters
 * and orchestrator. What the stores returned:
 * - "sony wh-1000xm5", "jbl flip 6", "airpods pro": Amazon lists the products
 *   but has no offer that ships them to Israel (for the XM5 its product page
 *   says it "cannot be shipped to your selected delivery location"). Its priced
 *   items are cases, ear tips, single replacement earbuds and other products.
 *   eBay has many sellers of each product, mixed with parts.
 * - "instant pot duo": both stores price the cookers; eBay's results are
 *   mostly user guides and cookbooks.
 */
const RECORDED = {
  "sony wh-1000xm5": { amazon: [xm5Amazon1, xm5Amazon2], ebay: xm5Ebay },
  "jbl flip 6": { amazon: [jblAmazon1, jblAmazon2], ebay: jblEbay },
  "airpods pro": { amazon: [airpodsAmazon1, airpodsAmazon2], ebay: airpodsEbay },
  "instant pot duo": { amazon: [instantAmazon1, instantAmazon2], ebay: instantEbay },
} as const;

async function search(text: keyof typeof RECORDED, sort: SearchSort = "relevance") {
  const { amazon: pages, ebay: ebayBody } = RECORDED[text];
  const amazon = createAmazonProvider({
    apiKey: "k",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: async (input) =>
      new Response(JSON.stringify(pages[new URL(String(input)).searchParams.get("page") === "2" ? 1 : 0])),
  });
  const ebay = createEbayProvider({
    tokens: { getToken: async () => ok("token"), invalidate: () => undefined },
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: async () => new Response(JSON.stringify(ebayBody)),
  });
  const query: SearchQuery = {
    rawText: text,
    detectedLanguage: "en",
    normalizedText: text,
    sort,
    filters: {},
    destination: { country: "IL" },
    page: 1,
    pageSize: 100,
  };
  return createSearchProducts({
    providers: [amazon, ebay],
    cache: createInMemorySearchCache(),
    circuitBreaker: createInMemoryCircuitBreakerStore(),
  })(query);
}

const shekels = (g: ProductGroup) => bestOffer(g).price.item.amountMinor / 100;
const listingsAt = (g: ProductGroup, store: string) => g.listings.filter((l) => l.provider === store).length;
const amazonNote = (g: ProductGroup) => g.unavailable.map((u) => u.provider);

describe("“sony wh-1000xm5”", () => {
  it("collapses eBay's sellers of the headphones into one card, compared with Amazon's “no offer”", async () => {
    const { groups } = await search("sony wh-1000xm5");
    const [top] = groups;
    expect(top?.offers.map((o) => o.provider)).toEqual(["ebay"]);
    expect(top && listingsAt(top, "ebay")).toBeGreaterThanOrEqual(18);
    expect(top && shekels(top)).toBeGreaterThan(600);
    expect(top && amazonNote(top)).toEqual(["amazon"]);
    // Colours (SA silver, BNT midnight blue, PM pink) are listings of the same card.
    expect(top?.listings.some((l) => /XM5SA/.test(l.title))).toBe(true);
    expect(top?.listings.some((l) => /XM5-BNT/.test(l.title))).toBe(true);
    // No other card is the headphones.
    expect(groups.slice(1).some((g) => /wh-?1000xm5/i.test(g.title) && !g.isAccessory)).toBe(false);
  });

  it("keeps parts out of the headphones card and below every product", async () => {
    const { groups } = await search("sony wh-1000xm5");
    const [top] = groups;
    expect(top?.listings.every((l) => l.price.item.amountMinor >= 600_00)).toBe(true);
    const firstAccessory = groups.findIndex((g) => g.isAccessory);
    expect(groups.slice(firstAccessory).every((g) => g.isAccessory)).toBe(true);
    expect(groups.filter((g) => g.isAccessory).length).toBeGreaterThan(20);
  });

  it("sorted by price, still opens with the headphones, not a ₪25 part", async () => {
    const { groups } = await search("sony wh-1000xm5", "landed_price_asc");
    expect(groups[0] && shekels(groups[0])).toBeGreaterThan(600);
  });
});

describe("“jbl flip 6”", () => {
  it("opens with one Flip 6 card for eBay's sellers, noting Amazon has no offer", async () => {
    const { groups } = await search("jbl flip 6");
    const [top] = groups;
    expect(top?.title).toMatch(/JBL Flip 6/);
    expect(top && listingsAt(top, "ebay")).toBe(2);
    expect(top && amazonNote(top)).toEqual(["amazon"]);
  });

  it("ranks the Flip 7 bundle and Flip Essential below it as related, and cases and ports last", async () => {
    const { groups } = await search("jbl flip 6");
    const flip7 = groups.find((g) => /Flip 7 Waterproof Portable Speaker Bundle/.test(g.title));
    expect(flip7).toMatchObject({ onIntent: false, isAccessory: false });
    expect(groups.find((g) => /Charging Port Board/.test(g.title))?.isAccessory).toBe(true);
    expect(groups.find((g) => /Hard Travel Case for JBL/.test(g.title))?.isAccessory).toBe(true);
  });
});

describe("“airpods pro”", () => {
  it("opens with AirPods Pro 2 and Pro 3 cards, each collapsing eBay's sellers and noting Amazon", async () => {
    const { groups } = await search("airpods pro");
    const [first, second] = groups;
    const titles = [first?.title, second?.title].join(" | ");
    expect(titles).toMatch(/AirPods Pro 2nd generation/i);
    expect(titles).toMatch(/AirPods Pro 3/);
    for (const g of [first, second]) {
      expect(g && listingsAt(g, "ebay")).toBeGreaterThanOrEqual(5);
      expect(g && amazonNote(g)).toEqual(["amazon"]);
    }
  });

  it("never mixes generations, and keeps a refurbished unit out of the new ones", async () => {
    const { groups } = await search("airpods pro");
    for (const g of groups) {
      const gens = new Set(g.listings.flatMap((l) => /\b(2nd|3rd|Pro 3|Pro 2)\b/i.exec(l.title)?.[1] ?? []));
      expect(gens.has("2nd") && (gens.has("3rd") || gens.has("Pro 3"))).toBe(false);
      const renewed = g.listings.filter((l) => /renewed/i.test(l.title)).length;
      expect(renewed === 0 || renewed === g.listings.length).toBe(true);
    }
  });

  it("treats single replacement earbuds and charging-case listings as parts", async () => {
    const { groups } = await search("airpods pro");
    expect(groups.find((g) => /Right Single Earbud/.test(g.title))?.isAccessory).toBe(true);
    expect(groups.find((g) => /Charging Case Box Accessories/.test(g.title))?.isAccessory).toBe(true);
  });
});

describe("“instant pot duo” (both stores ship it)", () => {
  it("opens with an Amazon vs eBay comparison of the Duo 6 Qt", async () => {
    const { groups } = await search("instant pot duo");
    const [top] = groups;
    expect(top?.offers.map((o) => o.provider)).toEqual(["amazon", "ebay"]);
    expect(top?.title).toMatch(/Duo 6 Qt 7-in-1/);
  });

  it("keeps user guides and cookbooks below every cooker", async () => {
    const { groups } = await search("instant pot duo");
    const books = groups.filter((g) => /User Guide|Cookbook|User Manual|Mastery Guide/i.test(g.title));
    expect(books.length).toBeGreaterThan(10);
    expect(books.every((g) => g.isAccessory)).toBe(true);
    const lastCooker = groups.findLastIndex(
      (g) => /Pressure Cooker|Multi-?Cooker/i.test(g.title) && !g.isAccessory,
    );
    expect(groups.findIndex((g) => books.includes(g))).toBeGreaterThan(lastCooker);
  });
});
