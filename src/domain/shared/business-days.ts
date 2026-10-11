const DAY_MS = 86_400_000;

export function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Weekdays (Mon–Fri, UTC) after `fromMs` up to and including `toMs`. 0 when `toMs` isn't later. */
export function businessDaysBetween(fromMs: number, toMs: number): number {
  let days = 0;
  for (let t = fromMs + DAY_MS; t <= toMs; t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return days;
}

/** Business days from `now`'s calendar day until `target`'s calendar day. */
export function businessDaysUntil(now: Date, target: Date): number {
  return businessDaysBetween(startOfUtcDay(now), startOfUtcDay(target));
}
