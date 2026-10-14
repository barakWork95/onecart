import { assembleResults } from "@/application/search/assemble-results";
import { searchIntent } from "@/domain/search/search-intent";
import type { ProviderId } from "@/domain/shared/provider";
import { makeProduct } from "@/test/product-factory";

const listing = (provider: ProviderId, sku: string, title: string, total: number) =>
  makeProduct({ provider, sku, title, total: total * 100 });

const RELEVANCE = { filters: {}, sort: "relevance" } as const;
const titlesOf = (groups: ReturnType<typeof assembleResults>["groups"]) =>
  groups.flatMap((g) => g.listings.map((l) => l.title));

describe("assembleResults — off-topic AliExpress listings (production, 2026-10-14)", () => {
  // AliExpress doesn't stock Instant Pot; its keyword search answered "instant pot duo" with faucets.
  const EBAY = [
    listing("ebay", "e1", "Instant Pot Duo 7 in 1 6 Qt Electric Pressure Cooker Stainless Steel", 640),
    listing("ebay", "e2", "Electric Pressure Cooker 6 Quart Multi-Use Programmable", 300),
  ];
  const ALIEXPRESS = [
    listing("aliexpress", "a1", "Chrome Purified Water Kitchen Faucet Pure Water Filter Dual Handle", 198),
    listing("aliexpress", "a2", "ZAPPO Gold and Chrome Kitchen Sink Faucet High Arc 360 Rotation", 588),
    listing("aliexpress", "a3", "Silicone Sealing Ring for Instant Pot Duo 6 Qt Replacement Gasket", 25),
  ];

  it("hides AliExpress listings that don't name the product a specific query asks for", () => {
    const { groups, offers } = assembleResults(
      [
        { products: EBAY, unavailable: [] },
        { products: ALIEXPRESS, unavailable: [] },
      ],
      RELEVANCE,
      searchIntent("instant pot duo"),
    );
    const titles = titlesOf(groups);
    expect(titles.some((t) => /Faucet/.test(t))).toBe(false);
    expect(offers.some((o) => /Faucet/.test(o.title))).toBe(false);
    // Kept: AliExpress's accessory naming the product, and every eBay listing (eBay's search is trusted).
    expect(titles).toEqual(
      expect.arrayContaining([
        "Silicone Sealing Ring for Instant Pot Duo 6 Qt Replacement Gasket",
        "Electric Pressure Cooker 6 Quart Multi-Use Programmable",
      ]),
    );
  });

  it("keeps everything for a category query", () => {
    const { groups } = assembleResults(
      [{ products: ALIEXPRESS, unavailable: [] }],
      RELEVANCE,
      searchIntent("kitchen faucet"),
    );
    expect(titlesOf(groups)).toHaveLength(3);
  });
});
