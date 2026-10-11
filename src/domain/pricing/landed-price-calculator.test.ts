import { calculateLandedPrice, type LandedPriceInput } from "@/domain/pricing/landed-price-calculator";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { addMoney, money, zeroMoney } from "@/domain/shared/money";
import { TEST_FX } from "@/test/fx";

/** Mirrors the Israeli rules, with a non-zero clearance fee so fee logic is exercised. */
const POLICY: ImportTaxPolicy = {
  vatRateBps: 1800,
  vatExemptionThreshold: money(75_00, "USD"),
  dutyExemptionThreshold: money(500_00, "USD"),
  defaultDutyRateBps: 1200,
  exemptionBasis: "goods_only",
  clearanceFee: money(10_00, "ILS"),
};

const usd = (cents: number) => money(cents, "USD");
const ils = (agorot: number) => money(agorot, "ILS");
const calc = (input: LandedPriceInput, policy: ImportTaxPolicy = POLICY) =>
  calculateLandedPrice(input, policy, TEST_FX);

describe("calculateLandedPrice — exemption threshold ($75)", () => {
  it("charges nothing extra well under the threshold", () => {
    const price = calc({ item: usd(20_00), shipping: usd(3_00) });
    expect(price).toMatchObject({
      item: ils(74_00),
      shipping: ils(11_10),
      importVat: ils(0),
      customsDuty: ils(0),
      fees: ils(0),
      total: ils(85_10),
      taxesCollectedAtCheckout: false,
    });
  });

  it("is exempt at exactly $75.00 (threshold is inclusive)", () => {
    const price = calc({ item: usd(75_00), shipping: zeroMoney("USD") });
    expect(price.importVat).toEqual(ils(0));
    expect(price.total).toEqual(ils(277_50));
  });

  it("charges 18% VAT + clearance fee one cent over the threshold", () => {
    const price = calc({ item: usd(75_01), shipping: zeroMoney("USD") });
    // 75.01 × 3.7 = 277.537 → ₪277.54; VAT 18% = 49.9572 → ₪49.96
    expect(price).toMatchObject({
      item: ils(277_54),
      importVat: ils(49_96),
      customsDuty: ils(0),
      fees: ils(10_00),
    });
    expect(price.total).toEqual(ils(337_50));
  });

  it("is exempt one cent under the threshold", () => {
    expect(calc({ item: usd(74_99), shipping: zeroMoney("USD") }).importVat).toEqual(ils(0));
  });

  it("charges VAT on the whole CIF value (item + shipping), not only the excess", () => {
    const price = calc({ item: usd(100_00), shipping: usd(20_00) });
    // CIF $120 = ₪444; VAT = ₪79.92
    expect(price.importVat).toEqual(ils(79_92));
    expect(price.total).toEqual(ils(444_00 + 79_92 + 10_00));
  });
});

describe("calculateLandedPrice — exemption basis", () => {
  const input: LandedPriceInput = { item: usd(70_00), shipping: usd(10_00) };

  it("goods_only: shipping does not push a $70 item over the threshold", () => {
    expect(calc(input, { ...POLICY, exemptionBasis: "goods_only" }).importVat).toEqual(ils(0));
  });

  it("goods_and_shipping: $70 + $10 shipping crosses the threshold", () => {
    const price = calc(input, { ...POLICY, exemptionBasis: "goods_and_shipping" });
    expect(price.importVat).toEqual(ils(53_28)); // 18% of ₪296
    expect(price.total).toEqual(ils(296_00 + 53_28 + 10_00));
  });
});

describe("calculateLandedPrice — customs duty threshold ($500)", () => {
  it("charges VAT but no duty at exactly $500", () => {
    const price = calc({ item: usd(500_00), shipping: zeroMoney("USD") });
    expect(price).toMatchObject({
      customsDuty: ils(0),
      importVat: ils(333_00),
      total: ils(1850_00 + 333_00 + 10_00),
    });
  });

  it("charges default duty above $500 and VAT on CIF + duty", () => {
    const price = calc({ item: usd(600_00), shipping: zeroMoney("USD") });
    // CIF ₪2220; duty 12% = ₪266.40; VAT 18% of ₪2486.40 = ₪447.552 → ₪447.55
    expect(price).toMatchObject({ customsDuty: ils(266_40), importVat: ils(447_55) });
    expect(price.total).toEqual(ils(2220_00 + 266_40 + 447_55 + 10_00));
  });

  it("uses an item-specific duty rate when given (e.g. 0% for electronics)", () => {
    const price = calc({ item: usd(600_00), shipping: zeroMoney("USD"), dutyRateBps: 0 });
    expect(price.customsDuty).toEqual(ils(0));
    expect(price.importVat).toEqual(ils(399_60));
  });
});

describe("calculateLandedPrice — taxes collected by the store", () => {
  it("uses the store's tax figure and adds no estimate or clearance fee", () => {
    const price = calc({
      item: usd(100_00),
      shipping: zeroMoney("USD"),
      taxesCollectedAtCheckout: usd(18_00),
    });
    expect(price).toMatchObject({
      importVat: ils(66_60),
      customsDuty: ils(0),
      fees: ils(0),
      total: ils(370_00 + 66_60),
      taxesCollectedAtCheckout: true,
    });
  });

  it("treats null like 'not collected'", () => {
    const price = calc({ item: usd(100_00), shipping: zeroMoney("USD"), taxesCollectedAtCheckout: null });
    expect(price.taxesCollectedAtCheckout).toBe(false);
    expect(price.importVat).toEqual(ils(66_60));
  });
});

describe("calculateLandedPrice — unknown shipping", () => {
  it("flags unknown shipping and excludes it from the total", () => {
    const price = calc({ item: usd(20_00), shipping: null });
    expect(price).toMatchObject({ shipping: ils(0), shippingKnown: false, total: ils(74_00) });
  });

  it("marks quoted shipping (including free) as known", () => {
    expect(calc({ item: usd(20_00), shipping: zeroMoney("USD") }).shippingKnown).toBe(true);
  });
});

describe("calculateLandedPrice — currencies", () => {
  it("handles ILS-priced items with an identity FX rate", () => {
    const price = calc({ item: ils(200_00), shipping: ils(15_00) });
    expect(price).toMatchObject({ listed: ils(200_00), fxRate: 1, total: ils(215_00) });
  });

  it("compares the threshold in a common currency when item and threshold differ", () => {
    // €50 = ₪200 < $75 = ₪277.50 → exempt
    const price = calc({ item: money(50_00, "EUR"), shipping: usd(5_00) });
    expect(price).toMatchObject({
      listed: money(50_00, "EUR"),
      fxRate: 4,
      importVat: ils(0),
      total: ils(218_50),
    });
  });
});

describe("calculateLandedPrice — invariants", () => {
  it.each([1_00, 74_99, 75_01, 150_00, 499_99, 500_01, 2_000_00])(
    "total always equals the sum of its components ($%p cents)",
    (cents) => {
      const p = calc({ item: usd(cents), shipping: usd(4_99) });
      expect(p.total).toEqual(addMoney(p.item, p.shipping, p.importVat, p.customsDuty, p.fees));
      expect(p.total.currency).toBe("ILS");
    },
  );

  it("never makes a cheaper item cost more than a pricier one in the same tax band", () => {
    const a = calc({ item: usd(80_00), shipping: zeroMoney("USD") }).total.amountMinor;
    const b = calc({ item: usd(81_00), shipping: zeroMoney("USD") }).total.amountMinor;
    expect(a).toBeLessThan(b);
  });
});

describe("calculateLandedPrice — policy validation", () => {
  const input: LandedPriceInput = { item: usd(10_00), shipping: zeroMoney("USD") };

  it.each<[string, Partial<ImportTaxPolicy>]>([
    ["fractional VAT bps", { vatRateBps: 1800.5 }],
    ["negative duty bps", { defaultDutyRateBps: -1 }],
    ["VAT above 100%", { vatRateBps: 10_001 }],
    ["non-ILS clearance fee", { clearanceFee: usd(1_00) }],
    ["thresholds in different currencies", { dutyExemptionThreshold: money(500_00, "EUR") }],
    ["duty threshold below VAT threshold", { dutyExemptionThreshold: usd(50_00) }],
  ])("rejects %s", (_label, override) => {
    expect(() => calc(input, { ...POLICY, ...override })).toThrow(RangeError);
  });
});
