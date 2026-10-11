import { diceSimilarity, sharesAny, tokenizeTitle } from "@/domain/matching/title-tokens";

describe("tokenizeTitle", () => {
  it("lower-cases, drops filler words and years, and joins hyphenated model numbers", () => {
    const tokens = tokenizeTitle("Sony WH-CH720N Wireless Headphones (2024) - NEW Original!");
    expect([...tokens.words]).toEqual(["sony", "whch720n", "wireless", "headphones"]);
    expect([...tokens.identifiers]).toEqual(["whch720n"]);
    expect(tokens.accessoryWords.size).toBe(0);
  });

  it("treats capacities and sizes as identifiers", () => {
    expect([...tokenizeTitle("Samsung 128GB microSD card").identifiers]).toEqual(["128gb"]);
  });

  it("strips diacritics", () => {
    expect([...tokenizeTitle("Café Crème Grinder").words]).toEqual(["cafe", "creme", "grinder"]);
  });

  it("flags accessory words", () => {
    expect([...tokenizeTitle("Silicone Case for AirPods Pro 2").accessoryWords]).toEqual(["case"]);
  });

  it("returns empty sets for an empty title", () => {
    expect(tokenizeTitle("  -- ").words.size).toBe(0);
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

describe("sharesAny", () => {
  it("detects a common element", () => {
    expect(sharesAny(new Set(["p3"]), new Set(["x", "p3"]))).toBe(true);
    expect(sharesAny(new Set(["p3"]), new Set(["p2"]))).toBe(false);
  });
});
