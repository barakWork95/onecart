import type { IsoDateTime } from "@/domain/product/unified-product";
import { CURRENCY_CODES, money, type CurrencyCode, type Money } from "@/domain/shared/money";

/** Snapshot of exchange rates into ILS. A rate is "ILS per 1 unit of the currency". */
export interface FxRates {
  readonly toIls: Readonly<Record<CurrencyCode, number>>;
  readonly asOf: IsoDateTime;
}

export function createFxRates(toIls: Readonly<Record<CurrencyCode, number>>, asOf: IsoDateTime): FxRates {
  for (const code of CURRENCY_CODES) {
    const rate = toIls[code];
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError(`FX rate for ${code} must be a positive finite number, got ${rate}`);
    }
  }
  if (toIls.ILS !== 1) throw new RangeError(`FX rate for ILS must be exactly 1, got ${toIls.ILS}`);
  return { toIls, asOf };
}

export function toIls(amount: Money, fx: FxRates): Money {
  if (amount.currency === "ILS") return amount;
  return money(Math.round(amount.amountMinor * fx.toIls[amount.currency]), "ILS");
}
