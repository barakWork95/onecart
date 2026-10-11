import { matchProducts, toMatchCandidate } from "@/domain/matching/product-matcher";
import { makeProduct, type ProductSpec } from "@/test/product-factory";

const c = (spec: ProductSpec) => toMatchCandidate(makeProduct(spec));

describe("matchProducts", () => {
  it("matches the same earbuds across stores by model number despite noisy titles", () => {
    const ali = c({
      provider: "aliexpress",
      title: "SoundCore Life P3 ANC Wireless Earbuds 2024 NEW",
      total: 89_00,
    });
    const amz = c({
      provider: "amazon",
      title: "Anker Soundcore Life P3 Noise Cancelling Earbuds",
      total: 142_00,
    });
    expect(matchProducts(ali, amz)).toEqual({ basis: "model_number", score: expect.any(Number) });
  });

  it("matches hyphenated and unhyphenated model numbers", () => {
    const a = c({ provider: "amazon", title: "Sony WH-CH720N Wireless Headphones" });
    const b = c({ provider: "ebay", title: "Sony WHCH720N Noise Canceling Headphones Black" });
    expect(matchProducts(a, b)?.basis).toBe("model_number");
  });

  it("rejects different models of the same line (P3 vs P2)", () => {
    const a = c({ provider: "amazon", title: "Soundcore Life P3 Earbuds" });
    const b = c({ provider: "temu", title: "Soundcore Life P2 Earbuds" });
    expect(matchProducts(a, b)).toBeNull();
  });

  it("rejects different capacities", () => {
    const a = c({ provider: "amazon", title: "SanDisk Extreme microSD 128GB" });
    const b = c({ provider: "aliexpress", title: "SanDisk Extreme microSD 256GB" });
    expect(matchProducts(a, b)).toBeNull();
  });

  it("rejects an accessory against the product it fits", () => {
    const a = c({ provider: "amazon", title: "Soundcore Life P3 Earbuds", total: 140_00 });
    const b = c({ provider: "aliexpress", title: "Silicone Case for Soundcore Life P3", total: 120_00 });
    expect(matchProducts(a, b)).toBeNull();
  });

  it("rejects listings whose prices are too far apart", () => {
    const a = c({ provider: "amazon", title: "Soundcore Life P3 Earbuds", total: 300_00 });
    const b = c({ provider: "temu", title: "Soundcore Life P3 Earbuds", total: 90_00 });
    expect(matchProducts(a, b)).toBeNull();
  });

  it("never matches two listings from the same store", () => {
    const a = c({ provider: "temu", sku: "1", title: "Soundcore Life P3" });
    const b = c({ provider: "temu", sku: "2", title: "Soundcore Life P3" });
    expect(matchProducts(a, b)).toBeNull();
  });

  it("matches generic items only when titles are near-identical", () => {
    const a = c({ provider: "amazon", title: "Cervical Memory Foam Pillow" });
    const b = c({ provider: "ebay", title: "Memory Foam Pillow, Cervical" });
    expect(matchProducts(a, b)).toEqual({ basis: "title_similarity", score: 1 });

    const loose = c({ provider: "temu", title: "Memory Foam Bed Pillow Soft" });
    expect(matchProducts(a, loose)).toBeNull();
  });

  it("falls back to title similarity when only one side has an identifier", () => {
    const a = c({ provider: "amazon", title: "Ergonomic Mesh Office Chair" });
    const b = c({ provider: "ebay", title: "Ergonomic Mesh Office Chair X1" });
    expect(matchProducts(a, b)?.basis).toBe("title_similarity");
  });

  it("requires some title overlap even with a shared identifier", () => {
    const a = c({ provider: "amazon", title: "Galaxy S24 Ultra Smartphone Titanium Unlocked Dual SIM" });
    const b = c({ provider: "ebay", title: "S24 Kitchen Faucet" });
    expect(matchProducts(a, b)).toBeNull();
  });
});
