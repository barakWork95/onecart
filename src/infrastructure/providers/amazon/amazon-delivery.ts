import { businessDaysBetween, startOfUtcDay } from "@/domain/shared/business-days";
import { moneyFromMajor, type Money } from "@/domain/shared/money";

export interface ParsedAmazonDelivery {
  /** null = shipping cost unknown (not quoted, or free only above a threshold we don't meet). */
  readonly shipping: Money | null;
  readonly isFreeShipping: boolean | null;
  /** The quoted amount also covers Amazon's import fees deposit (shown as "shipping & import fees"). */
  readonly includesImportFees: boolean;
  readonly minDays: number | null;
  readonly maxDays: number | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const WEEKDAY = "(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\\s+)?";
const DATE_RANGE = new RegExp(
  `${WEEKDAY}${MONTH}\\s+(\\d{1,2})(?:\\s*[-–]\\s*${WEEKDAY}(?:${MONTH}\\s+)?(\\d{1,2}))?`,
  "i",
);
const AMOUNT = "\\$(\\d[\\d,]*(?:\\.\\d{2})?)";
const PAID = new RegExp(`${AMOUNT}\\s+(?:delivery|shipping)`, "i");
const FREE = /\bFREE\s+(?:delivery|shipping)/i;
const FREE_THRESHOLD = new RegExp(`\\b(?:on|over)\\s+${AMOUNT}`, "i");

const usd = (text: string) => moneyFromMajor(Number(text.replace(/,/g, "")), "USD");

/** "Jan 17" relative to `now`: dates already past are next year's (December → January). */
function resolveDate(month: string, day: string, now: Date): number {
  const monthIndex = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
  const today = startOfUtcDay(now);
  const candidate = Date.UTC(now.getUTCFullYear(), monthIndex, Number(day));
  return candidate < today ? Date.UTC(now.getUTCFullYear() + 1, monthIndex, Number(day)) : candidate;
}

function parseDays(line: string, now: Date): { minDays: number | null; maxDays: number | null } {
  const today = startOfUtcDay(now);
  if (/\btoday\b/i.test(line)) return { minDays: 0, maxDays: 0 };
  if (/\btomorrow\b/i.test(line)) {
    const days = businessDaysBetween(today, today + 86_400_000);
    return { minDays: days, maxDays: days };
  }
  const match = DATE_RANGE.exec(line);
  if (!match) return { minDays: null, maxDays: null };
  const [, startMonth = "", startDay = "", endMonth, endDay] = match;
  const start = resolveDate(startMonth, startDay, now);
  const end = endDay ? resolveDate(endMonth ?? startMonth, endDay, now) : start;
  return {
    minDays: businessDaysBetween(today, start),
    maxDays: businessDaysBetween(today, Math.max(start, end)),
  };
}

/**
 * Reads SerpApi's free-text delivery lines. The first line is the standard
 * option; "Or fastest delivery …" lines are faster paid upgrades and ignored.
 * Anything we can't read becomes null — never a guess.
 */
export function parseAmazonDelivery(
  lines: readonly string[] | undefined,
  itemPrice: Money,
  now: Date,
): ParsedAmazonDelivery {
  const line = (lines ?? []).find((l) => !/^\s*or\s+fastest/i.test(l))?.trim() ?? "";
  const days = parseDays(line, now);
  const includesImportFees = /import fees/i.test(line);

  const paid = PAID.exec(line);
  if (paid?.[1]) {
    return { shipping: usd(paid[1]), isFreeShipping: false, includesImportFees, ...days };
  }

  if (FREE.test(line)) {
    const threshold = FREE_THRESHOLD.exec(line)?.[1];
    // "FREE delivery … on $35 of items": free only if this item alone reaches the threshold.
    const qualifies =
      !threshold || (itemPrice.currency === "USD" && itemPrice.amountMinor >= usd(threshold).amountMinor);
    return qualifies
      ? { shipping: moneyFromMajor(0, "USD"), isFreeShipping: true, includesImportFees, ...days }
      : { shipping: null, isFreeShipping: null, includesImportFees, ...days };
  }

  return { shipping: null, isFreeShipping: null, includesImportFees: false, ...days };
}
