import {
  containment,
  diceSimilarity,
  sharesAny,
  sharesModel,
  tokenizeTitle,
} from "@/domain/matching/title-tokens";

const variants = (title: string) =>
  Object.fromEntries([...tokenizeTitle(title).variants].map(([unit, values]) => [unit, [...values]]));

describe("tokenizeTitle", () => {
  it("lower-cases, drops filler words and years, and joins hyphenated model numbers", () => {
    const tokens = tokenizeTitle("Sony WH-CH720N Wireless Headphones (2024) - NEW Original!");
    expect([...tokens.words]).toEqual(["sony", "whch720n", "wireless", "headphones"]);
    expect([...tokens.models]).toEqual(["whch720n"]);
    expect([...tokens.brands]).toEqual(["sony"]);
    expect(tokens.isAccessory).toBe(false);
  });

  it("strips diacritics", () => {
    expect([...tokenizeTitle("Café Crème Grinder").words]).toEqual(["cafe", "creme", "grinder"]);
  });

  it("returns empty sets for an empty title", () => {
    const tokens = tokenizeTitle("  -- ");
    expect(tokens.words.size + tokens.models.size + tokens.numbers.size + tokens.variants.size).toBe(0);
  });

  describe("quantities and variants", () => {
    it("normalizes every spelling of a quantity to one token per unit", () => {
      expect(variants("Instant Pot Duo 7 in 1, 6 Qt")).toEqual({ in1: ["7"], qt: ["6"] });
      expect(variants("Duo 7-in-1 Pressure Cooker 6 Quarts")).toEqual({ in1: ["7"], qt: ["6"] });
      expect(variants("Samsung 128 GB microSD")).toEqual({ gb: ["128"] });
      expect(variants("Dish Cloths 6-Pack")).toEqual({ pk: ["6"] });
      expect(variants("Pack of 12 Tea Towels")).toEqual({ pk: ["12"] });
      expect(variants("Set of 4 Kitchen Towels")).toEqual({ pc: ["4"] });
      expect(variants("10 Pcs Teak Utensils")).toEqual({ pc: ["10"] });
      expect(variants("Wooden Spoons, 10-Piece Set")).toEqual({ pc: ["10"] });
      expect(variants("Apple Watch Series 9 45mm")).toEqual({ mm: ["45"] });
    });

    it("reads generations in any wording", () => {
      expect(variants("AirPods Pro (2nd Generation)")).toEqual({ gen: ["2"] });
      expect(variants("AirPods Pro 3 (2025 3rd Gen)")).toEqual({ gen: ["3"] });
      expect(variants("Echo Dot Gen 5")).toEqual({ gen: ["5"] });
    });

    it("treats a count of things as a variant, not a model code", () => {
      const tokens = tokenizeTitle("Sevenblue 2-Tier Under Sink Organizers");
      expect(tokens.models.size).toBe(0);
      expect(variants("Sevenblue 2-Tier Under Sink Organizers")).toEqual({ tier: ["2"] });
    });

    it("ignores spec quantities sellers word differently (battery hours, watts, voltage)", () => {
      const tokens = tokenizeTitle("Headphones Up to 50 Hours Playtime, 35W, 220V, 1200mAh");
      expect(tokens.models.size).toBe(0);
      expect(tokens.numbers.size).toBe(0);
      expect(tokens.variants.size).toBe(0);
      expect(tokens.words).toContain("50hours");
    });
  });

  describe("model codes and series numbers", () => {
    it("keeps letter-and-digit codes as models, spec codes out", () => {
      const tokens = tokenizeTitle("JBL Flip 6 IP67 Speaker USB-C Bluetooth 5.3 4K");
      expect([...tokens.models]).toEqual([]);
      expect([...tokens.numbers]).toEqual(["6", "53"]);
    });

    it("splits a word glued to a series number but not short codes", () => {
      expect([...tokenizeTitle("JBL Flip6 Speaker").numbers]).toEqual(["6"]);
      expect([...tokenizeTitle("Soundcore Life P3").models]).toEqual(["p3"]);
      expect([...tokenizeTitle("Sony WH-1000XM5").models]).toEqual(["wh1000xm5"]);
    });

    it("separates slash-listed models instead of gluing them", () => {
      expect([...tokenizeTitle("Case for JBL Flip 7/6/5").numbers]).toEqual(["7", "6", "5"]);
    });
  });

  describe("brands", () => {
    it("maps sub-brands to their parent and reads two-word brands", () => {
      expect([...tokenizeTitle("Soundcore by Anker P20i").brands]).toEqual(["anker"]);
      expect([...tokenizeTitle("Beats Solo 4").brands]).toEqual(["apple"]);
      expect([...tokenizeTitle("Instant Pot Duo Plus").brands]).toEqual(["instantpot"]);
      expect([...tokenizeTitle("Wireless Earbuds").brands]).toEqual([]);
    });
  });

  describe("qualifiers", () => {
    it("flags refurbished, used and bundle listings", () => {
      expect([...tokenizeTitle("AirPods Pro (2nd Generation) (Renewed)").qualifiers]).toEqual([
        "refurbished",
      ]);
      expect([...tokenizeTitle("Sony WH-1000XM5 Pre-Owned").qualifiers]).toEqual(["used"]);
      expect([...tokenizeTitle("Kindle Paperwhite Open Box").qualifiers]).toEqual(["used"]);
      expect([...tokenizeTitle("Flip 7 Speaker Bundle - Pair").qualifiers]).toEqual(["bundle"]);
    });
  });

  describe("accessories", () => {
    it.each([
      "Silicone Case for AirPods Pro 2",
      "Earpads for Sony WH-1000XM5 - Black",
      "Steam Release Valve Handle Replacement for Instant Pot Duo",
      "For Sony WI-XB400 Headset/Headphones Wireless Extra Bass",
      "1pcs New for SONY WH-1000XM5 XM5 16-Pin Plastic wire Connector",
      "Instant Pot Duo 7-in-1 Electric Pressure Cooker User Guide (2026)",
      'Silicone Lids for Bowls, 9.6" Instant Pot 6 Quart Accessory',
    ])("flags %p", (title) => {
      expect(tokenizeTitle(title).isAccessory).toBe(true);
    });

    it.each([
      "BRAND NEW SEALED Apple AirPods Wireless Bluetooth In-Ear Earbuds w/Charging Case",
      "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones with Microphone, Includes USB-C Charging Cable",
      "Noise Cancelling Headphones for Kids, Colorful RGB LED Lights",
      "Duo 6 Qt 7-in-1 Electric Pressure Cooker, Stainless Steel",
    ])("does not flag what comes in the box: %p", (title) => {
      expect(tokenizeTitle(title).isAccessory).toBe(false);
    });
  });
});

describe("diceSimilarity", () => {
  it("is 1 for identical sets, 0 for disjoint or empty sets", () => {
    expect(diceSimilarity(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(1);
    expect(diceSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(diceSimilarity(new Set(), new Set())).toBe(0);
  });

  it("measures partial overlap", () => {
    expect(diceSimilarity(new Set(["a", "b", "c"]), new Set(["a", "b", "d"]))).toBeCloseTo(2 / 3);
  });
});

describe("containment", () => {
  it("is the share of the smaller set found in the larger", () => {
    expect(containment(new Set(["a", "b"]), new Set(["a", "b", "c", "d"]))).toBe(1);
    expect(containment(new Set(["a", "x"]), new Set(["a", "b", "c"]))).toBe(0.5);
    expect(containment(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("sharesAny", () => {
  it("detects a common element", () => {
    expect(sharesAny(new Set(["p3"]), new Set(["x", "p3"]))).toBe(true);
    expect(sharesAny(new Set(["p3"]), new Set(["p2"]))).toBe(false);
  });
});

describe("sharesModel", () => {
  const m = (...codes: string[]) => new Set(codes);

  it("matches equal codes and a code missing its series prefix", () => {
    expect(sharesModel(m("p3"), m("p3"))).toBe(true);
    expect(sharesModel(m("wh1000xm5"), m("1000xm5"))).toBe(true);
  });

  it("matches a colour suffix on a long code", () => {
    expect(sharesModel(m("wh1000xm5"), m("wh1000xm5sa"))).toBe(true);
    expect(sharesModel(m("wh1000xm5"), m("wh1000xm5bnt"))).toBe(true);
  });

  it("rejects short suffixes and different models", () => {
    expect(sharesModel(m("wh1000xm5"), m("m5"))).toBe(false);
    expect(sharesModel(m("wh1000xm5"), m("wh1000xm4"))).toBe(false);
    expect(sharesModel(m("p3"), m("p3i"))).toBe(false);
    expect(sharesModel(m("wh1000xm5"), m("wh1000xm5abcd"))).toBe(false);
  });
});
