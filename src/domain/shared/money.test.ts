import {
  addMoney,
  compareMoney,
  CurrencyMismatchError,
  isCurrencyCode,
  money,
  moneyFromMajor,
  zeroMoney,
} from "@/domain/shared/money";

describe("money", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(89.5, "ILS")).toThrow(RangeError);
  });

  it("converts major units without float drift", () => {
    expect(moneyFromMajor(89.9, "ILS")).toEqual({ amountMinor: 8990, currency: "ILS" });
    expect(moneyFromMajor(0.1 + 0.2, "USD").amountMinor).toBe(30);
    expect(moneyFromMajor(-1.005, "USD").amountMinor).toBe(-100);
  });

  it("rejects non-finite major amounts", () => {
    expect(() => moneyFromMajor(Number.NaN, "ILS")).toThrow(RangeError);
  });

  it("adds same-currency amounts", () => {
    expect(addMoney(money(8990, "ILS"), money(1200, "ILS"), zeroMoney("ILS"))).toEqual(money(10190, "ILS"));
  });

  it("refuses to add or compare across currencies", () => {
    expect(() => addMoney(money(1, "ILS"), money(1, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => compareMoney(money(1, "ILS"), money(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("orders by amount", () => {
    const sorted = [money(300, "ILS"), money(100, "ILS"), money(200, "ILS")].sort(compareMoney);
    expect(sorted.map((m) => m.amountMinor)).toEqual([100, 200, 300]);
  });

  it("recognizes supported ISO currency codes only", () => {
    expect(isCurrencyCode("ILS")).toBe(true);
    expect(isCurrencyCode("ils")).toBe(false);
    expect(isCurrencyCode("BTC")).toBe(false);
  });
});
