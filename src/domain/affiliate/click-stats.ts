import type { DailyStoreClicks } from "@/domain/affiliate/ports";
import type { ProviderId } from "@/domain/shared/provider";

export interface ClickTotals {
  readonly clicks: number;
  readonly affiliated: number;
  /** affiliated ÷ clicks, 0–1; null with no clicks. */
  readonly affiliateShare: number | null;
}

export interface StoreClickTotals extends ClickTotals {
  readonly provider: ProviderId;
}

export interface DayClickTotals extends ClickTotals {
  readonly day: string;
  readonly stores: readonly StoreClickTotals[];
}

function totals(rows: readonly Pick<DailyStoreClicks, "clicks" | "affiliated">[]): ClickTotals {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const affiliated = rows.reduce((sum, r) => sum + r.affiliated, 0);
  return { clicks, affiliated, affiliateShare: clicks > 0 ? affiliated / clicks : null };
}

/** Busiest store first; ties by name so the order is stable. */
function byStore(rows: readonly DailyStoreClicks[]): StoreClickTotals[] {
  const groups = new Map<ProviderId, DailyStoreClicks[]>();
  for (const row of rows) groups.set(row.provider, [...(groups.get(row.provider) ?? []), row]);
  return [...groups]
    .map(([provider, group]) => ({ provider, ...totals(group) }))
    .sort((a, b) => b.clicks - a.clicks || a.provider.localeCompare(b.provider));
}

export interface ClickSummary {
  readonly overall: ClickTotals;
  readonly stores: readonly StoreClickTotals[];
  /** Newest day first; only days with clicks. */
  readonly days: readonly DayClickTotals[];
}

export function summarizeClicks(rows: readonly DailyStoreClicks[]): ClickSummary {
  const perDay = new Map<string, DailyStoreClicks[]>();
  for (const row of rows) perDay.set(row.day, [...(perDay.get(row.day) ?? []), row]);
  return {
    overall: totals(rows),
    stores: byStore(rows),
    days: [...perDay]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, group]) => ({ day, ...totals(group), stores: byStore(group) })),
  };
}
