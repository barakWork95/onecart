import { summarizeClicks } from "@/domain/affiliate/click-stats";
import type { DailyStoreClicks } from "@/domain/affiliate/ports";

const row = (day: string, provider: DailyStoreClicks["provider"], clicks: number, affiliated: number) => ({
  day,
  provider,
  clicks,
  affiliated,
});

describe("summarizeClicks", () => {
  it("totals per store and per day, busiest store and newest day first", () => {
    const summary = summarizeClicks([
      row("2026-10-12", "amazon", 4, 4),
      row("2026-10-12", "ebay", 6, 0),
      row("2026-10-13", "amazon", 2, 1),
    ]);
    expect(summary.overall).toEqual({ clicks: 12, affiliated: 5, affiliateShare: 5 / 12 });
    expect(summary.stores).toEqual([
      { provider: "amazon", clicks: 6, affiliated: 5, affiliateShare: 5 / 6 },
      { provider: "ebay", clicks: 6, affiliated: 0, affiliateShare: 0 },
    ]);
    expect(summary.days.map((d) => [d.day, d.clicks, d.stores.map((s) => s.provider)])).toEqual([
      ["2026-10-13", 2, ["amazon"]],
      ["2026-10-12", 10, ["ebay", "amazon"]],
    ]);
  });

  it("has no affiliate share without clicks", () => {
    expect(summarizeClicks([])).toEqual({
      overall: { clicks: 0, affiliated: 0, affiliateShare: null },
      stores: [],
      days: [],
    });
  });
});
