import { createClickReport, israelDay } from "@/application/affiliate/click-report";
import type { ClickStatsReader } from "@/domain/affiliate/ports";

describe("israelDay", () => {
  it("uses the Israeli calendar day, not UTC's", () => {
    // 22:30 UTC on Oct 12 is already 01:30 on Oct 13 in Israel (UTC+3 in October).
    expect(israelDay(new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
    expect(israelDay(new Date("2026-10-12T20:30:00Z"))).toBe("2026-10-12");
  });
});

describe("clickReport", () => {
  it("asks for the last N Israeli days, today included, and summarizes them", async () => {
    const stats: ClickStatsReader = {
      dailyClicks: jest.fn(async () => [
        { day: "2026-10-13", provider: "ebay" as const, clicks: 3, affiliated: 3 },
      ]),
    };
    const report = createClickReport({ stats, now: () => new Date("2026-10-12T22:30:00Z") });

    const result = await report(30);
    expect(stats.dailyClicks).toHaveBeenCalledWith("2026-09-14");
    expect(result.sinceDay).toBe("2026-09-14");
    expect(result.overall).toEqual({ clicks: 3, affiliated: 3, affiliateShare: 1 });

    expect((await report(1)).sinceDay).toBe("2026-10-13");
    expect((await report(0)).sinceDay).toBe("2026-10-13");
  });

  it("defaults to the real clock", async () => {
    const report = createClickReport({ stats: { dailyClicks: async () => [] } });
    expect((await report(7)).sinceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
