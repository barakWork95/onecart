import { createStatusReport } from "@/application/ops/status-report";
import type { ClickStatsReader } from "@/domain/affiliate/ports";
import type { CronRun } from "@/domain/ops/cron-run";
import type { OpsStore } from "@/domain/ops/ports";
import type { OpsStats } from "@/domain/ops/status";

const NOW = new Date("2026-10-19T08:00:00.000Z");
const run: CronRun = {
  job: "warm-trending",
  startedAt: "2026-10-19T07:30:00.000Z",
  finishedAt: "2026-10-19T07:30:31.000Z",
  ok: true,
  problems: [],
};
const ops: OpsStore = {
  recordRun: async () => undefined,
  history: async () => ({ "warm-trending": { last: run, lastOk: run } }),
};
const quota = {
  name: "eBay Browse API calls today",
  used: 412,
  limit: 5000,
  remaining: 4588,
  resetsAt: null,
  error: null,
};

describe("statusReport", () => {
  it("gathers runs, staleness, quotas, price rows, push and clicks", async () => {
    const days: string[][] = [];
    const stats: OpsStats = {
      priceObservationsByDay: async (d) => {
        days.push([...d]);
        return d.map((day, i) => ({ day, count: i === 0 ? 611 : 0 }));
      },
      push: async () => ({
        subscriptions: 2,
        failingSubscriptions: 0,
        alertsActive: 5,
        alertsTriggered: 1,
        alertsWaiting: 0,
      }),
    };
    const clicks: ClickStatsReader = {
      dailyClicks: async () => [
        { day: "2026-10-19", provider: "ebay", clicks: 7, affiliated: 7 },
        { day: "2026-10-19", provider: "aliexpress", clicks: 2, affiliated: 1 },
      ],
    };
    const report = await createStatusReport({
      ops,
      quotas: [{ read: async () => [quota] }],
      stats,
      clicks,
      now: () => NOW,
    })();

    expect(report.jobs).toEqual([
      { job: "warm-trending", last: run, lastOk: run, stale: false },
      { job: "price-alerts", last: null, lastOk: null, stale: true },
    ]);
    // price-alerts never ran (no record): shown as stale, not raised as an issue.
    expect(report.issues).toEqual([]);
    expect(report.quotas).toEqual([quota]);
    expect(days[0]).toHaveLength(14);
    expect(days[0]?.[0]).toBe("2026-10-19");
    expect(report.prices).toMatchObject({ kind: "ok" });
    expect(report.push).toEqual({ kind: "ok", value: expect.objectContaining({ subscriptions: 2 }) });
    expect(report.clicksToday).toEqual({ kind: "ok", value: { clicks: 9, affiliated: 8 } });
  });

  it("keeps going when a part is missing or failing", async () => {
    const report = await createStatusReport({
      ops: { recordRun: async () => undefined, history: () => Promise.reject(new Error("redis down")) },
      quotas: [{ read: () => Promise.reject(new Error("boom")) }],
      stats: {
        priceObservationsByDay: () => Promise.reject(new Error("db down")),
        push: () => Promise.reject(new Error("db down")),
      },
      clicks: null,
      now: () => NOW,
    })();
    expect(report.jobs.every((j) => j.last === null && j.stale)).toBe(true);
    expect(report.quotas).toEqual([expect.objectContaining({ name: "quota source", error: "boom" })]);
    expect(report.prices).toEqual({ kind: "error", message: "db down" });
    expect(report.clicksToday).toEqual({ kind: "not_configured" });

    const bare = await createStatusReport({ ops, quotas: [], stats: null, clicks: null })();
    expect(bare.push).toEqual({ kind: "not_configured" });
  });
});
