import { toIls, type FxRates } from "@/domain/pricing/fx-rates";
import { assertValidPolicy, type ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { LandedPrice } from "@/domain/product/unified-product";
import { addMoney, money, zeroMoney, type Money } from "@/domain/shared/money";

export interface LandedPriceInput {
  /** Item price as listed by the store, in the store's currency. */
  readonly item: Money;
  /** Shipping to Israel as listed; `zeroMoney(...)` for free shipping, null when the store doesn't say. */
  readonly shipping: Money | null;
  /**
   * Import taxes the store already charges at checkout (e.g. Amazon's import
   * fees deposit). When present, we trust it and estimate nothing on top.
   */
  readonly taxesCollectedAtCheckout?: Money | null;
  /** Item-specific customs duty (basis points); falls back to the policy default. */
  readonly dutyRateBps?: number;
}

function applyRate(amount: Money, bps: number): Money {
  return money(Math.round((amount.amountMinor * bps) / 10_000), amount.currency);
}

/**
 * Computes what the shopper pays to get the item delivered in Israel, in ILS.
 *
 * Rules (all values come from `policy`):
 * - basis = item (or item + shipping, per `exemptionBasis`). Unknown shipping counts as 0
 *   and is flagged via `shippingKnown: false` so the UI can show "+ shipping".
 * - basis ≤ VAT threshold → no VAT, no duty, no clearance fee.
 * - basis > VAT threshold → VAT on the whole CIF value (item + shipping), not just the excess.
 * - basis > duty threshold → duty on CIF too, and VAT is charged on CIF + duty.
 */
export function calculateLandedPrice(
  input: LandedPriceInput,
  policy: ImportTaxPolicy,
  fx: FxRates,
): LandedPrice {
  assertValidPolicy(policy);

  const item = toIls(input.item, fx);
  const shippingKnown = input.shipping !== null;
  const shipping = input.shipping ? toIls(input.shipping, fx) : zeroMoney("ILS");
  const cif = addMoney(item, shipping);
  const zero = zeroMoney("ILS");

  const base = {
    item,
    shipping,
    shippingKnown,
    listed: input.item,
    fxRate: fx.toIls[input.item.currency],
  };

  if (input.taxesCollectedAtCheckout) {
    const importVat = toIls(input.taxesCollectedAtCheckout, fx);
    return {
      ...base,
      importVat,
      customsDuty: zero,
      fees: zero,
      total: addMoney(cif, importVat),
      taxesCollectedAtCheckout: true,
    };
  }

  const basis = policy.exemptionBasis === "goods_only" ? item : cif;
  const vatThreshold = toIls(policy.vatExemptionThreshold, fx);
  const dutyThreshold = toIls(policy.dutyExemptionThreshold, fx);

  if (basis.amountMinor <= vatThreshold.amountMinor) {
    return {
      ...base,
      importVat: zero,
      customsDuty: zero,
      fees: zero,
      total: cif,
      taxesCollectedAtCheckout: false,
    };
  }

  const customsDuty =
    basis.amountMinor > dutyThreshold.amountMinor
      ? applyRate(cif, input.dutyRateBps ?? policy.defaultDutyRateBps)
      : zero;
  const importVat = applyRate(addMoney(cif, customsDuty), policy.vatRateBps);
  const fees = policy.clearanceFee;

  return {
    ...base,
    importVat,
    customsDuty,
    fees,
    total: addMoney(cif, customsDuty, importVat, fees),
    taxesCollectedAtCheckout: false,
  };
}
