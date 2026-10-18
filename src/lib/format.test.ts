import { money } from "@/domain/shared/money";
import { formatCount, formatDeliveryDays, formatMoney, formatSnapshotTime } from "@/lib/format";

describe("formatMoney", () => {
  it("rounds headline prices to whole shekels with the symbol first", () => {
    expect(formatMoney(money(89_00, "ILS"))).toBe("₪89");
    expect(formatMoney(money(98_49, "ILS"))).toBe("₪98");
    expect(formatMoney(money(98_50, "ILS"))).toBe("₪99");
    expect(formatMoney(money(1_234_00, "ILS"))).toBe("₪1,234");
  });

  it("shows agorot when precise", () => {
    expect(formatMoney(money(98_01, "ILS"), { precise: true })).toBe("₪98.01");
  });

  it("formats other currencies", () => {
    expect(formatMoney(money(12_50, "USD"), { precise: true })).toBe("US$12.50");
  });
});

describe("formatDeliveryDays", () => {
  const d = (minDays: number | null, maxDays: number | null) => ({
    minDays,
    maxDays,
    isFreeShipping: null,
    methodLabel: null,
  });

  it("formats ranges, single values, and unknowns", () => {
    expect(formatDeliveryDays(d(10, 12))).toBe("10–12 business days");
    expect(formatDeliveryDays(d(4, 4))).toBe("4 business days");
    expect(formatDeliveryDays(d(null, 1))).toBe("1 business day");
    expect(formatDeliveryDays(d(7, null))).toBe("7 business days");
    expect(formatDeliveryDays(d(null, null))).toBeNull();
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(1420)).toBe("1,420");
  });
});

describe("Hebrew formatting", () => {
  // Intl marks the number and symbol right-to-left (U+200F); strip them to compare the text.
  const plain = (s: string) => s.replace(/‏/g, "").replace(/ /g, " ");

  it("puts the shekel sign after the number", () => {
    expect(plain(formatMoney(money(89_00, "ILS"), { locale: "he" }))).toBe("89 ₪");
    expect(plain(formatMoney(money(1234_50, "ILS"), { locale: "he", precise: true }))).toBe("1,234.50 ₪");
  });

  it("says business days in Hebrew, one day included", () => {
    expect(
      formatDeliveryDays({ minDays: 10, maxDays: 12, isFreeShipping: null, methodLabel: null }, "he"),
    ).toBe("10–12 ימי עסקים");
    expect(
      formatDeliveryDays({ minDays: 1, maxDays: 1, isFreeShipping: null, methodLabel: null }, "he"),
    ).toBe("יום עסקים אחד");
  });

  it("dates a snapshot in Hebrew, Israel time", () => {
    expect(formatSnapshotTime("2026-10-13T07:30:00.000Z", "he")).toBe("13 באוק׳, 10:30");
    expect(formatCount(12345, "he")).toBe("12,345");
  });
});
