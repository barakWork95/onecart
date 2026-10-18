import type { CronRun } from "@/domain/ops/cron-run";
import { currentIssues, diffIssues } from "@/domain/ops/issues";
import type { QuotaReading } from "@/domain/ops/status";

const NOW = Date.parse("2026-10-19T08:00:00.000Z");
const run = (job: CronRun["job"], ok: boolean, problems: string[] = []): CronRun => ({
  job,
  startedAt: "2026-10-19T07:30:00.000Z",
  finishedAt: "2026-10-19T07:30:31.000Z",
  ok,
  problems,
});
const quota = (name: string, remaining: number | null): QuotaReading => ({
  name,
  used: null,
  limit: null,
  remaining,
  resetsAt: null,
  error: remaining === null ? "HTTP 500" : null,
});

describe("currentIssues", () => {
  it("collects failing runs, missed runs and quotas at zero (an unreadable quota isn't one)", () => {
    expect(
      currentIssues(
        {
          "warm-trending": {
            last: run("warm-trending", false, ["ebay: all 65 searches failed"]),
            lastOk: null,
          },
        },
        [
          quota("SerpApi searches this month (Amazon)", 0),
          quota("eBay Browse API calls today", 4588),
          quota("x", null),
        ],
        NOW,
      ),
    ).toEqual([
      { key: "run:warm-trending", message: "warm-trending: ebay: all 65 searches failed" },
      {
        key: "quota:SerpApi searches this month (Amazon)",
        message: "SerpApi searches this month (Amazon): none left",
      },
    ]);
  });

  it("alerts a missed run only for a job with a record (a fresh deploy has none)", () => {
    const old = { ...run("price-alerts", true), finishedAt: "2026-10-17T05:00:00.000Z" };
    expect(currentIssues({ "price-alerts": { last: old, lastOk: old } }, [], NOW)).toEqual([
      { key: "stale:price-alerts", message: "price-alerts hasn't run in over a day" },
    ]);
  });

  it("is empty when everything ran fine", () => {
    expect(
      currentIssues(
        {
          "warm-trending": { last: run("warm-trending", true), lastOk: null },
          "price-alerts": { last: run("price-alerts", true), lastOk: null },
        },
        [quota("eBay Browse API calls today", 4588)],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("diffIssues", () => {
  const a = { key: "a", message: "A" };
  const b = { key: "b", message: "B" };
  const c = { key: "c", message: "C (reworded)" };

  it("raises new issues, resolves cleared ones, and stays quiet about persisting ones", () => {
    expect(diffIssues([a, { key: "c", message: "C" }], [c, b])).toEqual({ raised: [b], resolved: [a] });
    expect(diffIssues([a], [a])).toEqual({ raised: [], resolved: [] });
  });
});
