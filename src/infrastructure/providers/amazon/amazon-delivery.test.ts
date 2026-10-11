import { money } from "@/domain/shared/money";
import { parseAmazonDelivery } from "@/infrastructure/providers/amazon/amazon-delivery";

// Sunday 11 Oct 2026.
const NOW = new Date("2026-10-11T09:00:00.000Z");
const usd = (cents: number) => money(cents, "USD");
const parse = (lines: string[] | undefined, item = usd(29_99), now = NOW) =>
  parseAmazonDelivery(lines, item, now);

describe("parseAmazonDelivery", () => {
  it("reads a paid delivery with a single date", () => {
    expect(parse(["$8.40 delivery Thu, Oct 15"])).toEqual({
      shipping: usd(8_40),
      isFreeShipping: false,
      includesImportFees: false,
      minDays: 4,
      maxDays: 4,
    });
  });

  it("reads a date range across weekdays and ignores 'Or fastest' upgrades", () => {
    expect(
      parse(["Or fastest delivery Wed, Oct 14", "$12.00 delivery Mon, Oct 19 - Fri, Oct 23"]),
    ).toMatchObject({
      shipping: usd(12_00),
      minDays: 6,
      maxDays: 10,
    });
  });

  it("reads a short range ('Oct 19 – 23') and one spanning months", () => {
    expect(parse(["$5.00 delivery Oct 19 – 23"])).toMatchObject({ minDays: 6, maxDays: 10 });
    expect(parse(["$5.00 delivery Fri, Oct 30 - Wed, Nov 4"])).toMatchObject({ minDays: 15, maxDays: 18 });
  });

  it("treats past dates as next year (December → January)", () => {
    const lateDecember = new Date("2026-12-28T09:00:00.000Z"); // Monday
    expect(parse(["$5.00 delivery Mon, Jan 4"], usd(10_00), lateDecember)).toMatchObject({
      minDays: 5,
      maxDays: 5,
    });
  });

  it("handles today and tomorrow", () => {
    expect(parse(["FREE delivery Today"])).toMatchObject({ minDays: 0, maxDays: 0 });
    expect(parse(["FREE delivery Tomorrow, Oct 12"])).toMatchObject({ minDays: 1, maxDays: 1 });
  });

  it("treats unconditional free delivery as free", () => {
    expect(parse(["FREE Shipping to Israel"])).toMatchObject({
      shipping: usd(0),
      isFreeShipping: true,
      minDays: null,
    });
  });

  it("is free only when the item alone meets the free-delivery threshold", () => {
    expect(parse(["FREE delivery Wed, Oct 21 on $49 of eligible items"], usd(49_99))).toMatchObject({
      shipping: usd(0),
      isFreeShipping: true,
      maxDays: 8,
    });
    expect(parse(["FREE delivery Wed, Oct 21 on $35 of items shipped by Amazon"], usd(9_99))).toMatchObject({
      shipping: null,
      isFreeShipping: null,
      maxDays: 8,
    });
    expect(parse(["FREE delivery over $1,000.00"], usd(999_99))).toMatchObject({ shipping: null });
  });

  it("never treats a non-USD item as meeting a dollar threshold", () => {
    expect(parse(["FREE delivery on $35 of items"], money(500_00, "ILS"))).toMatchObject({ shipping: null });
  });

  it("flags amounts that include Amazon's import fees deposit", () => {
    expect(parse(["$31.42 shipping & import fees deposit to Israel"])).toMatchObject({
      shipping: usd(31_42),
      includesImportFees: true,
    });
  });

  it("returns unknowns for missing or unreadable lines", () => {
    const unknown = {
      shipping: null,
      isFreeShipping: null,
      includesImportFees: false,
      minDays: null,
      maxDays: null,
    };
    expect(parse(undefined)).toEqual(unknown);
    expect(parse([])).toEqual(unknown);
    expect(parse(["Ships to Israel"])).toEqual(unknown);
  });
});
