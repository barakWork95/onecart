import { createFxRates, toIls } from "@/domain/pricing/fx-rates";
import { money } from "@/domain/shared/money";
import { TEST_FX } from "@/test/fx";

describe("createFxRates", () => {
  const valid = { ILS: 1, USD: 3.7, EUR: 4, CNY: 0.5, GBP: 4.7 };

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects a USD rate of %p", (rate) => {
    expect(() => createFxRates({ ...valid, USD: rate }, "2026-10-11T00:00:00.000Z")).toThrow(RangeError);
  });

  it("requires ILS to be the identity rate", () => {
    expect(() => createFxRates({ ...valid, ILS: 1.01 }, "2026-10-11T00:00:00.000Z")).toThrow(/ILS/);
  });
});

describe("toIls", () => {
  it("returns ILS amounts untouched", () => {
    const shekels = money(8990, "ILS");
    expect(toIls(shekels, TEST_FX)).toBe(shekels);
  });

  it("converts and rounds to whole agorot", () => {
    expect(toIls(money(1999, "USD"), TEST_FX)).toEqual(money(7396, "ILS")); // 73.963 → 73.96
    expect(toIls(money(1, "CNY"), TEST_FX)).toEqual(money(1, "ILS")); // 0.5 → rounds half up
  });
});
