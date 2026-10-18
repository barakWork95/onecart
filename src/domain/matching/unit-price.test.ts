import { unitPrice } from "@/domain/matching/unit-price";
import { money } from "@/domain/shared/money";

const ils = (minor: number) => money(minor, "ILS");

describe("unitPrice", () => {
  it("divides a stated multi-pack's landed total per piece", () => {
    expect(unitPrice("10 Pcs Magnetic Cable Clips", ils(32_00))).toEqual({ pack: 10, perUnit: ils(3_20) });
    expect(unitPrice("Silicone Kitchenware 6-Piece Set, Cream Scraper", ils(38_31))).toEqual({
      pack: 6,
      perUnit: ils(6_39),
    });
    expect(unitPrice("Measuring Spoons, Set of 4", ils(20_00))).toEqual({ pack: 4, perUnit: ils(5_00) });
  });

  it("is null for one item, no stated pack, or a menu of pack sizes", () => {
    expect(unitPrice("1 Pc Magnetic Phone Holder", ils(10_00))).toBeNull();
    expect(unitPrice("Magnetic Phone Holder", ils(10_00))).toBeNull();
    expect(unitPrice("1/50Pcs Ultra Thin Metal Plate Stickers", ils(1_99))).toBeNull();
    expect(unitPrice("Food Grade Silicone Baking Spatula Set 2/5PCS", ils(124_28))).toBeNull();
    expect(unitPrice("Cable Clips 5 Pcs and 10 Pcs", ils(9_00))).toBeNull();
  });
});
