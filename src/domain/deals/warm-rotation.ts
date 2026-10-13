const DAY_MS = 24 * 60 * 60 * 1000;
/** Margin past the refresh interval, so an entry never lapses before its next refresh. */
const TTL_MARGIN_SECONDS = 12 * 60 * 60;

/**
 * Which items a rotating daily job refreshes today: `perDay` consecutive items,
 * advancing `perDay` a day and wrapping, so every item comes round within
 * `rotationDays(n, perDay)` days. Pure; the day is the UTC epoch day.
 */
export function rotationFor<T>(items: readonly T[], perDay: number, atMs: number): T[] {
  const count = Math.min(items.length, Math.max(0, Math.floor(perDay)));
  if (count === 0) return [];
  const day = Math.floor(atMs / DAY_MS);
  const start = (day * count) % items.length;
  return Array.from({ length: count }, (_, i) => items[(start + i) % items.length] as T);
}

/** Days between refreshes of one item (at most). */
export function rotationDays(itemCount: number, perDay: number): number {
  const count = Math.floor(perDay);
  if (itemCount <= 0 || count <= 0) return 0;
  return Math.ceil(itemCount / Math.min(count, itemCount));
}

/** Cache lifetime for a rotated item: its refresh interval plus a margin. */
export function rotationTtlSeconds(itemCount: number, perDay: number): number {
  return rotationDays(itemCount, perDay) * 24 * 60 * 60 + TTL_MARGIN_SECONDS;
}
