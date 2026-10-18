import { alertRunProblems, staleJobs, warmRunProblems, type CronRun } from "@/domain/ops/cron-run";

const search = (query: string, outcomes: Record<string, string>) => ({
  query,
  outcomes: Object.entries(outcomes).map(([provider, status]) => ({ provider, status })),
});

describe("warmRunProblems", () => {
  it("is quiet when stores answer, even with a stray failure", () => {
    expect(
      warmRunProblems({
        trending: [search("a", { ebay: "ok", aliexpress: "timeout" })],
        categories: [
          search("b", { ebay: "ok", aliexpress: "ok" }),
          search("c", { ebay: "empty", aliexpress: "ok" }),
        ],
        priceHistory: { recorded: 10, drops: 0 },
      }),
    ).toEqual([]);
  });

  it("names stores failing half their searches or more, and a price-history error", () => {
    expect(
      warmRunProblems({
        trending: [search("a", { ebay: "ok", amazon: "error", aliexpress: "circuit_open" })],
        categories: [search("b", { ebay: "ok", amazon: "error", aliexpress: "ok" })],
        priceHistory: "error",
      }),
    ).toEqual([
      "amazon: all 2 searches failed",
      "aliexpress: 1 of 2 searches failed",
      "price history: recording failed",
    ]);
  });
});

describe("alertRunProblems", () => {
  it("flags failed searches, a failed notification run, or every push failing", () => {
    expect(alertRunProblems({ checked: 3, failedSearches: 0, notifications: "not_configured" })).toEqual([]);
    expect(alertRunProblems({ checked: 3, failedSearches: 2, notifications: "error" })).toEqual([
      "price alerts: 2 searches failed",
      "notifications: the run failed",
    ]);
    expect(
      alertRunProblems({ checked: 3, failedSearches: 0, notifications: { alerts: 2, sent: 0, failed: 2 } }),
    ).toEqual(["notifications: all 2 pushes failed"]);
    // Some pushes going through is a working channel.
    expect(
      alertRunProblems({ checked: 3, failedSearches: 0, notifications: { alerts: 2, sent: 1, failed: 1 } }),
    ).toEqual([]);
  });
});

describe("staleJobs", () => {
  const run = (finishedAt: string): CronRun => ({
    job: "warm-trending",
    startedAt: finishedAt,
    finishedAt,
    ok: true,
    problems: [],
  });
  const NOW = Date.parse("2026-10-19T08:00:00.000Z");

  it("lists jobs that never ran or last finished over 26 hours ago", () => {
    expect(
      staleJobs({ "warm-trending": { last: run("2026-10-18T07:31:00.000Z"), lastOk: null } }, NOW),
    ).toEqual(["price-alerts"]);
    expect(
      staleJobs(
        {
          "warm-trending": { last: run("2026-10-18T05:59:00.000Z"), lastOk: null },
          "price-alerts": { last: run("2026-10-19T05:00:00.000Z"), lastOk: null },
        },
        NOW,
      ),
    ).toEqual(["warm-trending"]);
  });
});
