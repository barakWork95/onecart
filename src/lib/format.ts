import type { DeliveryEstimate } from "@/domain/product/unified-product";
import type { Money } from "@/domain/shared/money";
import type { Locale } from "@/i18n/locales";

/** Intl locale per interface language: prices and dates as read in Israel. */
const INTL_LOCALE: Readonly<Record<Locale, string>> = { en: "en-IL", he: "he-IL" };

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: Locale, currency: string, fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${locale}:${currency}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    // en-IL puts the symbol first ("₪89"); he-IL puts it after, with right-to-left marks ("89 ₪").
    f = new Intl.NumberFormat(INTL_LOCALE[locale], {
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
 * Headline prices round to whole shekels ("₪98", "98 ₪"); pass `precise` for
 * breakdowns where agorot matter ("₪98.01").
 */
export function formatMoney(amount: Money, options: { precise?: boolean; locale?: Locale } = {}): string {
  const locale = options.locale ?? "en";
  if (options.precise) return formatter(locale, amount.currency, 2).format(amount.amountMinor / 100);
  return formatter(locale, amount.currency, 0).format(Math.round(amount.amountMinor / 100));
}

const BUSINESS_DAYS: Readonly<Record<Locale, (n: number) => string>> = {
  en: (n) => `${n} business ${n === 1 ? "day" : "days"}`,
  he: (n) => (n === 1 ? "יום עסקים אחד" : `${n} ימי עסקים`),
};
const BUSINESS_DAY_RANGE: Readonly<Record<Locale, (min: number, max: number) => string>> = {
  en: (min, max) => `${min}–${max} business days`,
  he: (min, max) => `${min}–${max} ימי עסקים`,
};

/** "10–12 business days", "4 business days", or null when the store didn't say. */
export function formatDeliveryDays(delivery: DeliveryEstimate, locale: Locale = "en"): string | null {
  const { minDays, maxDays } = delivery;
  if (minDays === null && maxDays === null) return null;
  if (minDays === null || maxDays === null || minDays === maxDays) {
    return BUSINESS_DAYS[locale](maxDays ?? minDays ?? 0);
  }
  return BUSINESS_DAY_RANGE[locale](minDays, maxDays);
}

export function formatCount(n: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US").format(n);
}

const SNAPSHOT_TIMES = new Map<Locale, Intl.DateTimeFormat>();

/** "13 Oct, 10:30" (Hebrew: "13 באוק׳, 10:30") in Israel time: when a cached price was fetched. */
export function formatSnapshotTime(iso: string, locale: Locale = "en"): string {
  let f = SNAPSHOT_TIMES.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    });
    SNAPSHOT_TIMES.set(locale, f);
  }
  return f.format(new Date(iso));
}
