import { createClickAnalytics } from "@/application/affiliate/click-analytics";
import type { ClickAnalyticsReader, ClickStatsReader, DailyStoreClicks } from "@/domain/affiliate/ports";

// 09:00 UTC = 12:00 in Israel on 19 October.
const NOW = new Date("2026-10-19T09:00:00.000Z");
const day = (d: string, provider: DailyStoreClicks["provider"], clicks: number): DailyStoreClicks => ({
  day: d,
  provider,
  clicks,
  affiliated: clicks,
});

function setup(rows: DailyStoreClicks[]) {
  const sinceDays: string[] = [];
  const stats: ClickStatsReader = {
    dailyClicks: async (since) => {
      sinceDays.push(since);
      return rows.filter((r) => r.day >= since);
    },
  };
  const reader: ClickAnalyticsReader = {
    topProducts: jest.fn(async () => [
      { productId: "ebay:1", provider: "ebay" as const, title: "JBL", clicks: 4 },
    ]),
    recentClicks: jest.fn(async () => []),
  };
  const analytics = createClickAnalytics({ stats, analytics: reader, now: () => NOW });
  return { analytics, reader, sinceDays };
}

describe("clickAnalytics", () => {
  it("counts today, the last 7 and the last 30 Israeli days", async () => {
    const { analytics, sinceDays } = setup([
      day("2026-10-19", "ebay", 3),
      day("2026-10-19", "aliexpress", 2),
      day("2026-10-13", "ebay", 4), // 7th day back, included
      day("2026-10-12", "amazon", 5), // 8th day back
      day("2026-09-20", "ebay", 1), // 30th day back, included
    ]);
    const dashboard = await analytics();
    expect(sinceDays).toEqual(["2026-09-20"]);
    expect(dashboard.kpis).toEqual({ today: 5, last7Days: 9, last30Days: 15 });
  });

  it("breaks the 30 days down by store, most first, and passes top products and recent clicks through", async () => {
    const { analytics, reader } = setup([
      day("2026-10-19", "ebay", 3),
      day("2026-10-18", "ebay", 2),
      day("2026-10-18", "aliexpress", 4),
      day("2026-10-01", "amazon", 1),
    ]);
    const dashboard = await analytics();
    expect(dashboard.byStore).toEqual([
      { provider: "ebay", clicks: 5 },
      { provider: "aliexpress", clicks: 4 },
      { provider: "amazon", clicks: 1 },
    ]);
    expect(reader.topProducts).toHaveBeenCalledWith(10);
    expect(reader.recentClicks).toHaveBeenCalledWith(50);
    expect(dashboard.topProducts).toHaveLength(1);
    expect(dashboard.recent).toEqual([]);
  });
});
