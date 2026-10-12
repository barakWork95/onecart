import { classifyOffers, matchesIntent, searchIntent } from "@/domain/search/search-intent";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { makeProduct } from "@/test/product-factory";

describe("searchIntent", () => {
  it.each([
    ["sony wh-1000xm5", true, false],
    ["jbl flip 6", true, false],
    ["airpods pro 2nd generation", true, false],
    ["wireless headphones", false, false],
    ["kitchen", false, false],
    ["sony wh-1000xm5 case", true, true],
  ])("%p → specific %p, wants accessory %p", (text, specific, wantsAccessory) => {
    expect(searchIntent(text)).toMatchObject({ specific, wantsAccessory });
  });
});

describe("matchesIntent", () => {
  const on = (query: string, title: string) => matchesIntent(searchIntent(query), tokenizeTitle(title));

  it("needs the query's model code", () => {
    expect(on("sony wh-1000xm5", "Sony WH1000XM5 Noise Canceling Headphones")).toBe(true);
    expect(on("sony wh-1000xm5", "SONY WH-1000XM5-BNT Midnight Blue Headphones")).toBe(true);
    expect(on("sony wh-1000xm5", "WF-1000XM5 Truly Wireless Earbuds")).toBe(false);
    expect(on("sony wh-1000xm5", "WH-1000XM6 Wireless Headphones")).toBe(false);
  });

  it("needs a brand's series number, and no other brand", () => {
    expect(on("jbl flip 6", "Flip 6 - Portable Waterproof Speaker")).toBe(true);
    expect(on("jbl flip 6", "JBL Flip 7 Speaker")).toBe(false);
    expect(on("jbl flip 6", "Sony Flip 6 Speaker")).toBe(false);
    expect(on("airpods pro 2nd generation", "Apple AirPods Pro (2nd Gen)")).toBe(true);
  });

  it("accepts everything for a category search", () => {
    expect(on("wireless headphones", "Anything at all")).toBe(true);
  });
});

describe("classifyOffers", () => {
  const listing = (sku: string, title: string, shekels: number) =>
    makeProduct({ provider: "ebay", sku, title, total: shekels * 100 });
  const headphones = [
    listing("h1", "Sony WH-1000XM5 Noise Canceling Wireless Headphones Black", 1000),
    listing("h2", "Sony WH-1000XM5 Wireless Headphones Silver", 1100),
    listing("h3", "Sony WH-1000XM5 Premium Headphones", 900),
  ];
  const classify = (query: string, extra: ReturnType<typeof listing>[]) =>
    classifyOffers([...headphones, ...extra], searchIntent(query));

  it("keeps a product sold with a case as the product, at the product's price", () => {
    const withCase = listing("c1", "Sony WH-1000XM5 Hard Case Premium Over-Ear Headphones", 1700);
    expect(classify("sony wh-1000xm5", [withCase]).get(withCase.id)).toEqual({
      onIntent: true,
      isAccessory: false,
    });
  });

  it("treats a cheap listing under the model name as a part, with or without accessory words", () => {
    const bracket = listing("p1", "Sony WH-1000XM5 Hinge Swivel Bracket", 101);
    const port = listing("p2", "SONY WH-1000XM5 Type C Charging Port Flex Ribbon", 227);
    const classes = classify("sony wh-1000xm5", [bracket, port]);
    expect(classes.get(bracket.id)?.isAccessory).toBe(true);
    expect(classes.get(port.id)?.isAccessory).toBe(true);
    expect(classes.get(headphones[0]!.id)?.isAccessory).toBe(false);
  });

  it("always treats “for <brand>” and replacement parts as accessories", () => {
    const pads = listing("p3", "Replacement Ear Pads for Sony WH-1000XM5", 1500);
    expect(classify("sony wh-1000xm5", [pads]).get(pads.id)?.isAccessory).toBe(true);
  });

  it("falls back to the title when there's no typical price (category search or no clean listing)", () => {
    const withCase = listing("c2", "Sony WH-1000XM5 Hard Case Headphones", 1700);
    expect(classify("wireless headphones", [withCase]).get(withCase.id)).toEqual({
      onIntent: true,
      isAccessory: true,
    });
    const only = classifyOffers([withCase], searchIntent("sony wh-1000xm5"));
    expect(only.get(withCase.id)?.isAccessory).toBe(true);
  });

  it("doesn't reclassify when the shopper asked for an accessory", () => {
    const withCase = listing("c3", "Sony WH-1000XM5 Hard Case", 60);
    expect(classify("sony wh-1000xm5 case", [withCase]).get(withCase.id)?.isAccessory).toBe(true);
  });

  it("uses the middle of an even number of clean prices, the part's own price included", () => {
    const part = listing("p4", "Sony WH-1000XM5 Headband Assembly", 250);
    // Clean prices 250, 900, 1000, 1100: typical (900 + 1000) / 2 = 950, and 250 is under 30% of it.
    expect(
      classifyOffers([...headphones, part], searchIntent("sony wh-1000xm5")).get(part.id)?.isAccessory,
    ).toBe(true);
  });
});
