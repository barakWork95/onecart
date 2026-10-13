import type { DeliveryEstimate } from "@/domain/product/unified-product";
import type { Money } from "@/domain/shared/money";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    // en-IL puts the symbol first ("₪89") to match the English UI; he-IL would render "89 ₪".
    f = new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Headline prices round to whole shekels ("₪98"); pass `precise` for
 * breakdowns where agorot matter ("₪98.01").
 */
export function formatMoney(amount: Money, options: { precise?: boolean } = {}): string {
  if (options.precise) return formatter(amount.currency, 2).format(amount.amountMinor / 100);
  return formatter(amount.currency, 0).format(Math.round(amount.amountMinor / 100));
}

/** "10–12 business days", "4 business days", or null when the store didn't say. */
export function formatDeliveryDays(delivery: DeliveryEstimate): string | null {
  const { minDays, maxDays } = delivery;
  if (minDays === null && maxDays === null) return null;
  if (minDays === null || maxDays === null || minDays === maxDays) {
    const days = maxDays ?? minDays;
    return `${days} business ${days === 1 ? "day" : "days"}`;
  }
  return `${minDays}–${maxDays} business days`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const SNAPSHOT_TIME = new Intl.DateTimeFormat("en-IL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jerusalem",
});

/** "13 Oct, 10:30" in Israel time: when a cached price was fetched. */
export function formatSnapshotTime(iso: string): string {
  return SNAPSHOT_TIME.format(new Date(iso));
}
