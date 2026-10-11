import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { assertValidPolicy } from "@/domain/pricing/import-tax-policy";

describe("ISRAEL_IMPORT_POLICY", () => {
  it("is a valid policy", () => {
    expect(() => assertValidPolicy(ISRAEL_IMPORT_POLICY)).not.toThrow();
  });

  it("matches the rules verified on 2026-10-11 (update this test deliberately when the law changes)", () => {
    expect(ISRAEL_IMPORT_POLICY).toMatchObject({
      vatRateBps: 1800,
      vatExemptionThreshold: { amountMinor: 75_00, currency: "USD" },
      dutyExemptionThreshold: { amountMinor: 500_00, currency: "USD" },
    });
  });
});
