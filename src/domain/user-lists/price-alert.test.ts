import { money } from "@/domain/shared/money";
import {
  evaluateAlert,
  suggestTarget,
  validateTarget,
  type PriceAlert,
} from "@/domain/user-lists/price-alert";

const ils = (agorot: number) => money(agorot, "ILS");

const ALERT: PriceAlert = {
  id: "a1",
  productId: "aliexpress:1",
  provider: "aliexpress",
  title: "Life P3",
  imageUrl: null,
  productUrl: "https://www.aliexpress.com/item/1.html",
  searchText: "wireless earbuds",
  target: ils(80_00),
  baseline: ils(89_00),
  lastSeen: ils(89_00),
  lastCheckedAt: "2026-10-10T05:00:00.000Z",
  status: "active",
  triggeredAt: null,
  createdAt: "2026-10-10T05:00:00.000Z",
};
const AT = "2026-10-11T05:00:00.000Z";

describe("validateTarget", () => {
  it("accepts a positive target below today's price", () => {
    expect(validateTarget(ils(80_00), ils(89_00))).toEqual({ ok: true, value: ils(80_00) });
  });

  it.each([
    ["zero", ils(0), "target_not_positive"],
    ["negative", ils(-1), "target_not_positive"],
    ["non-ILS", money(10_00, "USD"), "target_not_positive"],
    ["equal to today's price", ils(89_00), "target_not_below_current"],
    ["above today's price", ils(95_00), "target_not_below_current"],
  ] as const)("rejects a %s target", (_label, target, error) => {
    expect(validateTarget(target, ils(89_00))).toEqual({ ok: false, error });
  });
});

describe("suggestTarget", () => {
  it("suggests 10% off, rounded down to a whole shekel", () => {
    expect(suggestTarget(ils(89_00))).toEqual(ils(80_00));
    expect(suggestTarget(ils(142_04))).toEqual(ils(127_00));
  });

  it("never suggests less than ₪1", () => {
    expect(suggestTarget(ils(50))).toEqual(ils(1_00));
  });
});

describe("evaluateAlert", () => {
  it("records today's price without triggering above the target", () => {
    expect(evaluateAlert(ALERT, { price: ils(85_00), at: AT })).toEqual({
      ...ALERT,
      lastSeen: ils(85_00),
      lastCheckedAt: AT,
    });
  });

  it("triggers at or below the target", () => {
    for (const price of [ils(80_00), ils(79_99)]) {
      expect(evaluateAlert(ALERT, { price, at: AT })).toMatchObject({
        status: "triggered",
        triggeredAt: AT,
        lastSeen: price,
      });
    }
  });

  it("keeps the last known price when the product is missing today", () => {
    expect(evaluateAlert(ALERT, { price: null, at: AT })).toMatchObject({
      lastSeen: ils(89_00),
      lastCheckedAt: AT,
      status: "active",
    });
  });

  it("stays triggered (keeping the original trigger time) as prices move on", () => {
    const triggered = evaluateAlert(ALERT, { price: ils(75_00), at: AT });
    const later = evaluateAlert(triggered, { price: ils(99_00), at: "2026-10-12T05:00:00.000Z" });
    expect(later).toMatchObject({ status: "triggered", triggeredAt: AT, lastSeen: ils(99_00) });
  });
});
