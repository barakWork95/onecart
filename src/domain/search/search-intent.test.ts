import { classifyOffers, matchesIntent, pairMode, searchIntent } from "@/domain/search/search-intent";
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

describe("classifyOffers — recorded AliExpress titles (2026-10-14)", () => {
  // Real "jbl flip 6" results: AliExpress mixes parts and cases into a product search.
  const LISTINGS: readonly [string, number, boolean][] = [
    [
      "EVA Speaker Carrying Case, Durable Protective Organizer for JBL Flip 3/4/5/6, Portable Outdoor",
      26.1,
      true,
    ],
    [
      "For JBL Flip 6 TL GG Original Brand New USB Charge Jack Power Supply Board Connector Bluetooth",
      17.91,
      true,
    ],
    [
      "Speaker Protection Bracket for JBL GO3 Protective Case Strap Bracket Portable GO 3 Speaker",
      13.05,
      true,
    ],
    [
      "New 100% Original Battery Bluetooth For JBL Flip 6 Flip6 Player Speaker Rechargeable Battery",
      34.75,
      true,
    ],
    // Only a weak signal ("Case"): its price, a quarter of the speakers', settles it.
    ["LTGEM Case Compatible with JBL Flip 7/5 / 6 / Grip Waterproof Portable Bluetooth Speaker", 38.02, true],
    [
      "JBL FLIP6 Cylinder Bluetooth Speaker IP67 Waterproof Dustproof Stereo Sound For Beach Camping",
      136.3,
      false,
    ],
    [
      "JBL Flip 6 Compact Outdoor Bluetooth Speaker IP67 Waterproof Deep Bass Stereo USB-C Rechargeable",
      189.34,
      false,
    ],
    [
      "JBL Flip 6 Portable Wireless Bluetooth Speaker - IP67 Waterproof Deep Bass Subwoofer for Outdoor",
      147.5,
      false,
    ],
  ];

  it("demotes every part and case below the speakers", () => {
    const products = LISTINGS.map(([title, price], i) =>
      makeProduct({ provider: "aliexpress", sku: String(i), title, total: Math.round(price * 100) }),
    );
    const classes = classifyOffers(products, searchIntent("jbl flip 6"));
    expect(products.map((p) => classes.get(p.id)?.isAccessory)).toEqual(LISTINGS.map(([, , acc]) => acc));
  });
});

describe("searchIntent — mode", () => {
  it.each([
    ["airpods pro", "branded"],
    ["sony wh-1000xm5", "branded"],
    ["anker nano power bank", "branded"],
    ["sony", "branded"],
    // A model code alone is treated strictly: it may be a brand we don't know.
    ["xr7 earbuds", "branded"],
    ["vegetable peeler", "generic"],
    ["car phone holder", "generic"],
    ["led strip 5m", "generic"],
    ["desk mat 80x30", "generic"],
    ["wireless headphones", "generic"],
  ])("%p is %p", (query, mode) => {
    expect(searchIntent(query).mode).toBe(mode);
  });
});

describe("pairMode", () => {
  const t = (title: string) => tokenizeTitle(title);

  it("is generic only when neither listing names a known brand", () => {
    expect(
      pairMode(t("Magnetic Car Phone Holder 360 Rotation"), t("Car Phone Mount Magnetic Dashboard")),
    ).toBe("generic");
    expect(pairMode(t("Baseus Magnetic Car Phone Holder"), t("Car Phone Mount Magnetic Dashboard"))).toBe(
      "branded",
    );
    expect(pairMode(t("Car Phone Mount Magnetic"), t("Anker Car Mount"))).toBe("branded");
  });

  it("ignores the brands a listing is made for: a holder for iPhone is an unbranded holder", () => {
    expect(
      pairMode(
        t("Foldable Magnet Car Mobile Phone Holder for MagSafe 360° for iPhone 17 Huawei Xiaomi"),
        t("360 Degrees Magnetic Car Phone Holder Stand In Car For IPhone Xiaomi"),
      ),
    ).toBe("generic");
    expect(pairMode(t("Baseus Magnetic Holder for iPhone"), t("Magnetic Holder for iPhone"))).toBe("branded");
  });
});

describe("classifyOffers — generic queries", () => {
  it("keeps weak accessory words (holder, mount, strip) as the product, but not replacement parts", () => {
    const products = [
      makeProduct({
        provider: "ebay",
        sku: "1",
        title: "Magnetic Car Phone Holder Dashboard Mount",
        total: 45_00,
      }),
      makeProduct({
        provider: "aliexpress",
        sku: "2",
        title: "Car Phone Holder Air Vent Clip 360",
        total: 12_00,
      }),
      makeProduct({
        provider: "ebay",
        sku: "3",
        title: "Replacement Clip for Car Phone Holder",
        total: 8_00,
      }),
    ];
    const classes = classifyOffers(products, searchIntent("car phone holder"));
    expect(products.map((p) => classes.get(p.id)?.isAccessory)).toEqual([false, false, true]);
  });

  it("still demotes weak accessory words for a branded query", () => {
    const products = [
      makeProduct({ provider: "ebay", sku: "1", title: "Case for AirPods Pro", total: 30_00 }),
    ];
    expect(classifyOffers(products, searchIntent("airpods pro")).get(products[0]!.id)?.isAccessory).toBe(
      true,
    );
  });
});
