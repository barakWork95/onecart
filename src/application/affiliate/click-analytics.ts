import { israelDay } from "@/application/affiliate/click-report";
import type {
  ClickAnalyticsReader,
  ClickStatsReader,
  ProductClicks,
  RecordedClick,
} from "@/domain/affiliate/ports";
import type { ProviderId } from "@/domain/shared/provider";

/** How many products and recent clicks the dashboard lists. */
export const TOP_PRODUCTS = 10;
export const RECENT_CLICKS = 50;
const WINDOW_DAYS = 30;

export interface ClickDashboard {
  /** Clicks by Israeli calendar day: today, the last 7 days and the last 30, today included. */
  readonly kpis: { readonly today: number; readonly last7Days: number; readonly last30Days: number };
  /** The last 30 days per store, most clicked first. */
  readonly byStore: readonly { readonly provider: ProviderId; readonly clicks: number }[];
  readonly topProducts: readonly ProductClicks[];
  readonly recent: readonly RecordedClick[];
}

export interface ClickAnalyticsDeps {
  readonly stats: ClickStatsReader;
  readonly analytics: ClickAnalyticsReader;
  readonly now?: () => Date;
}

/** `YYYY-MM-DD` of the Israeli day `daysBack` before `date`'s. */
function daysBefore(date: Date, daysBack: number): string {
  // Noon UTC steps whole calendar days without landing on a DST edge.
  const noon = new Date(`${israelDay(date)}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() - daysBack);
  return israelDay(noon);
}

/** The internal analytics dashboard's data: KPIs, store breakdown, top products, latest clicks. */
export function createClickAnalytics(deps: ClickAnalyticsDeps) {
  const now = deps.now ?? (() => new Date());
  return async function clickAnalytics(): Promise<ClickDashboard> {
    const at = now();
    const today = israelDay(at);
    const weekStart = daysBefore(at, 6);
    const since = daysBefore(at, WINDOW_DAYS - 1);
    const [daily, topProducts, recent] = await Promise.all([
      deps.stats.dailyClicks(since),
      deps.analytics.topProducts(TOP_PRODUCTS),
      deps.analytics.recentClicks(RECENT_CLICKS),
    ]);
    const sum = (from: string) => daily.filter((d) => d.day >= from).reduce((n, d) => n + d.clicks, 0);
    const perStore = new Map<ProviderId, number>();
    for (const d of daily) perStore.set(d.provider, (perStore.get(d.provider) ?? 0) + d.clicks);
    return {
      kpis: { today: sum(today), last7Days: sum(weekStart), last30Days: sum(since) },
      byStore: [...perStore]
        .map(([provider, clicks]) => ({ provider, clicks }))
        .sort((a, b) => b.clicks - a.clicks || a.provider.localeCompare(b.provider)),
      topProducts,
      recent,
    };
  };
}
