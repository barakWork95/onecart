import { findConflict, matchProducts, toMatchCandidate } from "@/domain/matching/product-matcher";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import { makeProduct, type ProductSpec } from "@/test/product-factory";

const c = (spec: ProductSpec) => toMatchCandidate(makeProduct(spec));

/** An Amazon and an eBay listing at the given item prices (₪). */
function pair(amazonTitle: string, ebayTitle: string, amazonPrice = 300, ebayPrice = 300) {
  return [
    c({ provider: "amazon", sku: "a", title: amazonTitle, total: amazonPrice * 100 }),
    c({ provider: "ebay", sku: "e", title: ebayTitle, total: ebayPrice * 100 }),
  ] as const;
}

describe("matchProducts", () => {
  describe("same product, real Amazon vs eBay titles (recorded 2026-10-12)", () => {
    it.each([
      [
        "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
        "Sony WH-1000XM5 Noise Canceling Wireless Headphones Black",
      ],
      // eBay's long seller title; colour suffix on Sony's code (SA = silver).
      [
        "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Silver",
        "NEW Sony WH-1000XM5SA Wireless Noise Canceling Headphones - Black",
      ],
      [
        "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones with Microphone, Up to 50 Hours Battery Life with Quick Charge Function, Includes USB-C Charging Cable - Black - International Version (No Warranty)",
        "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones, Sound, Lightweight Design, U",
      ],
      [
        "AirPods Pro (2nd Generation) Wireless Ear Buds with USB-C Charging, Up to 2X More Active Noise Cancelling Bluetooth Headphones, Transparency Mode, Adaptive, Personalized Spatial Audio, White",
        "Apple AirPods Pro 2nd generation (USB-C)",
      ],
      [
        "Flip 6 - Portable Waterproof Speaker - Black",
        "New JBL Flip 6 Portable Bluetooth Speaker Black Waterproof IP67 Wireless 12H",
      ],
    ])("%p ≈ %p (model_number)", (amazon, ebay) => {
      const [a, e] = pair(amazon, ebay);
      expect(matchProducts(a, e)?.basis).toBe("model_number");
    });

    it("matches a branded item whose Amazon title omits the brand, as a similar item", () => {
      const [a, e] = pair(
        "Duo 6 Qt 7-in-1 Electric Pressure Cooker, Stainless Steel",
        "Instant Pot Duo 7 in 1 6 Qt Electric Pressure Cooker Stainless Steel Slow Cooker",
        244,
        276,
      );
      expect(matchProducts(a, e)?.basis).toBe("title_similarity");
    });
  });

  describe("different products that the old matcher merged (real false merges)", () => {
    it.each([
      // "100% cotton" shared a bare number; pack sizes differ.
      [
        "Homaxy 100% Cotton Waffle Weave Kitchen Dish Cloths 6-Pack, Dark Grey",
        "12 Pack 100% Egyptian Cotton Terry Tea Towels Large Catering Kitchen Cloths",
        28,
        40,
      ],
      [
        'Premium Kitchen Towels 6 Pack 100% Cotton, 20"x28" Dish Towels - Grey',
        "100% Cotton Kitchen Tea Towels pack of 5 Durable Tea Towels Super Absorbent",
        74,
        26,
      ],
      // Two brands of generic teak spoons.
      [
        "Wooden Spoons for Cooking – 10 Pcs Non Toxic Teak Kitchen Utensils Set",
        "Montuk 10 Pcs Natural Teak Wood Cooking Utensils Set For Kitchen, Spoon set.",
        124,
        192,
      ],
      // Accessories sharing the model they fit.
      [
        "XM5 Sweat Ear Covers for Sony WH-1000XM5 Accessories - Black",
        "1pcs New for SONY WH-1000XM5 XM5 16-Pin Plastic wire Connector Interface Socket",
        28,
        24,
      ],
      [
        "Earpads for Sony WH-1000XM5 - Black",
        "Dekoni Audio Alpine Cooling Earpads for Sony WH1000XM5",
        52,
        75,
      ],
      [
        "Silicone Case for JBL FLIP 6 Waterproof Portable Bluetooth Speaker",
        "For JBL Flip 6 Bluetooth Speaker Storage Bag / Silicone Protective Case Travel",
        31,
        51,
      ],
      [
        "Bike Mount for JBL Flip 3/4/5/6/7 & Flip Essential 2",
        "Case For JBL Flip 7 6 5 Flip Essential 2 Tuner 2 UE Boom 3 2 Portable Speaker",
        59,
        61,
      ],
      // A Pro Pod spare earbud against a charging-case listing.
      [
        "A2084 Left Earbud Replacement, Single Left Ear Side Only for Original Pod Pro 1st Gen, Compatible with OEM Pods Pro Charging Case A2190",
        "Apple AirPods Pro 1 Gen. Charging Case Box Accessories",
        207,
        260,
      ],
      // A paperback guide against the cooker.
      [
        "Duo 7-in-1 Mini Electric Pressure Cooker, Slow Rice Cooker, Steamer, Sauté, Yogurt Maker, Warmer & Sterilizer, Includes Free App with over 1900 Recipes, Stainless Steel, 3 Quart",
        "Instant Pot Duo 7-in-1 Electric Pressure Cooker User Guide (2026): Step-by-Step",
        216,
        79,
      ],
      // Different Instant Pot lines and sizes.
      [
        "Rio 6 Qt 7-in-1 Electric Pressure Cooker, Black",
        "Instant Pot Duo 6QT(5.7L) 7-in-1 Electric Pressure Cooker Multi Pot 220V",
        340,
        600,
      ],
      [
        "Pressure Cooker 6QT, 9-in-1, Ceramic Coating Pot, 12 Safety Features",
        "Instant Pot Duo Plus 9-in-1 Multi-Use Programmable Pressure Cooker",
        278,
        368,
      ],
      [
        "Duo Plus 8 Qt 9-in-1 Electric Pressure Cooker, WhisperQuiet",
        "Instant Pot Duo Plus 9-in-1 Multi-Use Programmable Pressure Cooker",
        494,
        298,
      ],
      [
        "6 Qt 9-in-1 Electric Pressure Cooker, WhisperQuiet",
        "Instant Pot Duo 7 in 1 6 Qt Electric Pressure Cooker Stainless Steel Slow Cooker",
        433,
        276,
      ],
    ])("%p ≠ %p", (amazon, ebay, amazonPrice, ebayPrice) => {
      const [a, e] = pair(amazon, ebay, amazonPrice, ebayPrice);
      expect(matchProducts(a, e)).toBeNull();
    });
  });

  describe("near-misses that must stay apart", () => {
    it.each([
      [
        "WH-1000XM6 The Best Noise Cancelling Wireless Headphones, Black",
        "Sony WH-1000XM5 Noise Canceling Wireless Headphones Black",
      ],
      [
        "Flip 7 Portable Bluetooth Speaker, Waterproof and Drop-Proof - Black",
        "New JBL Flip 6 Portable Bluetooth Speaker Black Waterproof IP67 Wireless 12H",
      ],
      [
        "Charge 6 - Portable Waterproof & DropProof Bluetooth Speaker (Black)",
        "New JBL Flip 6 Portable Bluetooth Speaker Black Waterproof IP67 Wireless 12H",
      ],
      [
        "AirPods (3rd Generation) Wireless Ear Buds, Bluetooth Headphones, Personalized Spatial Audio",
        "AirPods Pro 3rd Generation",
      ],
      ["Apple AirPods Pro (3nd Generation) (Renewed)", "Apple AirPods Pro 2nd generation (USB-C)"],
      ["AirPods Pro (2nd Generation) (Renewed)", "Apple AirPods Pro 2nd generation (USB-C)"],
      [
        "WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones, Black Bundle with Deco Gear Wood Headphone Display Stand",
        "Sony WH-1000XM5 Noise Canceling Wireless Headphones Black",
      ],
      [
        "Midea 10-in-1 Electric Pressure Cooker, 6 Quarts, Stainless Steel Pot",
        "Instant Pot Duo 7 in 1 6 Qt Electric Pressure Cooker Stainless Steel Slow Cooker",
      ],
      [
        "Kindle Paperwhite Bundle: Includes, Amazon Kindle Paperwhite Signature Edition 32GB | Black, Fabric Cover",
        "Amazon Kindle Paperwhite Manga Model 32GB Japan NEW",
      ],
      // A brandless title can't borrow identity from a model code on the other side.
      [
        "Sony Wireless Noise Cancelling Headphones Black",
        "Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black",
      ],
    ])("%p ≠ %p", (amazon, ebay) => {
      const [a, e] = pair(amazon, ebay);
      expect(matchProducts(a, e)).toBeNull();
    });
  });

  describe("rules", () => {
    it("matches hyphenated and unhyphenated model numbers", () => {
      const [a, e] = pair(
        "Sony WH-CH720N Wireless Headphones",
        "Sony WHCH720N Noise Canceling Headphones Black",
      );
      expect(matchProducts(a, e)?.basis).toBe("model_number");
    });

    it("matches across sub-brand naming (Soundcore by Anker)", () => {
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

    it("matches two listings of the same accessory only on near-identical titles", () => {
      const a = c({ provider: "amazon", title: "Silicone Case for Soundcore Life P3 Black" });
      const b = c({ provider: "ebay", title: "Soundcore Life P3 Silicone Case Black" });
      expect(matchProducts(a, b)?.basis).toBe("title_similarity");
    });

    it("rejects listings whose prices are too far apart", () => {
      const [a, e] = pair("Soundcore Life P3 Earbuds", "Soundcore Life P3 Earbuds", 260, 100);
      expect(matchProducts(a, e)).toBeNull();
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

    it("falls back to title similarity when only one side has a model code", () => {
      const a = c({ provider: "amazon", title: "Ergonomic Mesh Office Chair" });
      const b = c({ provider: "ebay", title: "Ergonomic Mesh Office Chair X1" });
      expect(matchProducts(a, b)?.basis).toBe("title_similarity");
    });

    it("requires title overlap even with a shared model code", () => {
      const a = c({ provider: "amazon", title: "Galaxy S24 Ultra Smartphone Titanium Unlocked Dual SIM" });
      const b = c({ provider: "ebay", title: "S24 Kitchen Faucet" });
      expect(matchProducts(a, b)).toBeNull();
    });

    it("needs a brand to match on a shared series number", () => {
      const [a, e] = pair(
        "Flip 6 Portable Speaker Black",
        "Flip 6 Portable Waterproof Bluetooth Speaker Black Wireless",
      );
      expect(matchProducts(a, e)).toBeNull();
      const [a2, e2] = pair(
        "Flip 6 Portable Speaker Black",
        "JBL Flip 6 Portable Waterproof Bluetooth Speaker Black Wireless",
      );
      expect(matchProducts(a2, e2)?.basis).toBe("model_number");
    });
  });
});

describe("findConflict", () => {
  const conflict = (x: string, y: string) => findConflict(tokenizeTitle(x), tokenizeTitle(y));

  it.each<[string, string, ReturnType<typeof findConflict>]>([
    ["Sony WH-1000XM5", "Bose QuietComfort Ultra", "brand"],
    ["AirPods Pro 2 (Renewed)", "AirPods Pro 2", "condition"],
    ["Sony WH-1000XM5", "Sony WH-1000XM4", "model"],
    ["Instant Pot Duo 6 Qt", "Instant Pot Duo 8 Qt", "variant"],
    ["JBL Flip 6", "JBL Flip 7", "number"],
    ["JBL Flip 6", "JBL Flip 7/6/5", null],
    ["Duo 6 Qt", "Instant Pot Duo 6 Qt", null],
  ])("%p vs %p → %p (either order)", (x, y, expected) => {
    expect(conflict(x, y)).toBe(expected);
    expect(conflict(y, x)).toBe(expected);
  });
});
