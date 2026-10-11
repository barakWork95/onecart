import type { Money } from "@/domain/shared/money";

/**
 * Which value is compared against the exemption thresholds.
 * - `goods_only`: item price only (shipping excluded when charged separately).
 * - `goods_and_shipping`: item + shipping (stricter; more orders become taxable).
 */
export type ExemptionBasis = "goods_only" | "goods_and_shipping";

/**
 * Personal-import tax rules for a destination country. Values are data, not
 * code: the concrete Israeli policy lives in `src/config/israel-import-policy.ts`
 * and is passed into the calculator, so a law change is a one-file edit.
 */
export interface ImportTaxPolicy {
  /** VAT in basis points (1800 = 18%). */
  readonly vatRateBps: number;
  /** Orders whose basis value is ≤ this pay no VAT and no duty. */
  readonly vatExemptionThreshold: Money;
  /** Orders whose basis value is ≤ this pay no customs duty (VAT may still apply). */
  readonly dutyExemptionThreshold: Money;
  /** Customs duty applied above `dutyExemptionThreshold` when the item has no specific rate. */
  readonly defaultDutyRateBps: number;
  readonly exemptionBasis: ExemptionBasis;
  /** Carrier/customs handling fee, charged only when import taxes are due and collected on delivery. */
  readonly clearanceFee: Money;
}

const MAX_BPS = 10_000;

export function assertValidPolicy(policy: ImportTaxPolicy): void {
  for (const [name, bps] of [
    ["vatRateBps", policy.vatRateBps],
    ["defaultDutyRateBps", policy.defaultDutyRateBps],
  ] as const) {
    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BPS) {
      throw new RangeError(`${name} must be an integer between 0 and ${MAX_BPS}, got ${bps}`);
    }
  }
  if (policy.clearanceFee.currency !== "ILS") {
    throw new RangeError("clearanceFee must be in ILS");
  }
  if (policy.vatExemptionThreshold.currency !== policy.dutyExemptionThreshold.currency) {
    throw new RangeError("Exemption thresholds must share a currency");
  }
  if (policy.dutyExemptionThreshold.amountMinor < policy.vatExemptionThreshold.amountMinor) {
    throw new RangeError("dutyExemptionThreshold cannot be below vatExemptionThreshold");
  }
}
