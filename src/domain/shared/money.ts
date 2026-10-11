/**
 * Money is always stored as an integer count of minor units (agorot, cents)
 * to avoid floating-point drift when summing price components.
 */
export const CURRENCY_CODES = ["ILS", "USD", "EUR", "CNY", "GBP"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

export interface Money {
  /** Integer minor units, e.g. ₪89.90 → 8990. Never a float. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} with ${b}; convert first`);
    this.name = "CurrencyMismatchError";
  }
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`amountMinor must be a safe integer, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

/** Builds Money from a major-unit decimal (e.g. a provider's `"89.90"`), rounding half away from zero. */
export function moneyFromMajor(amountMajor: number, currency: CurrencyCode): Money {
  if (!Number.isFinite(amountMajor)) {
    throw new RangeError(`amountMajor must be finite, got ${amountMajor}`);
  }
  const sign = amountMajor < 0 ? -1 : 1;
  return money(sign * Math.round(Math.abs(amountMajor) * 100), currency);
}

export function zeroMoney(currency: CurrencyCode): Money {
  return money(0, currency);
}

export function addMoney(...parts: readonly [Money, ...Money[]]): Money {
  const [first, ...rest] = parts;
  return rest.reduce<Money>((sum, part) => {
    if (part.currency !== sum.currency) throw new CurrencyMismatchError(sum.currency, part.currency);
    return money(sum.amountMinor + part.amountMinor, sum.currency);
  }, first);
}

export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return a.amountMinor - b.amountMinor;
}
