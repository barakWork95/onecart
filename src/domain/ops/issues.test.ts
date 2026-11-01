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

  it("warns once a quota that asks for it is nearly used up, before it runs out", () => {
    const upstash = (used: number): QuotaReading => ({
      name: "Upstash Redis commands this month",
      used,
      limit: 500_000,
      remaining: 500_000 - used,
      resetsAt: "2026-12-01T00:00:00.000Z",
      error: null,
      warnAtShare: 0.8,
    });
    expect(currentIssues({}, [upstash(399_999)], NOW)).toEqual([]);
    expect(currentIssues({}, [upstash(412_345)], NOW)).toEqual([
      {
        key: "quota-near:Upstash Redis commands this month",
        message: "Upstash Redis commands this month: 82% used (412,345 of 500,000)",
      },
    ]);
    // At zero it's the "none left" issue instead, not both.
    expect(currentIssues({}, [upstash(500_000)], NOW).map((i) => i.key)).toEqual([
      "quota:Upstash Redis commands this month",
    ]);
    // Quotas that don't ask (SerpApi ends every month near 99% by design) never warn early.
    expect(currentIssues({}, [{ ...upstash(499_000), warnAtShare: undefined }], NOW)).toEqual([]);
  });

  it("alerts an unreadable quota only when it says an error means an outage", () => {
    const down: QuotaReading = {
      name: "Upstash Redis commands this month",
      used: null,
      limit: 500_000,
      remaining: null,
      resetsAt: null,
      error: "Redis unreachable (fetch failed)",
      alertOnError: true,
    };
    expect(currentIssues({}, [down], NOW)).toEqual([
      {
        key: "quota-error:Upstash Redis commands this month",
        message: "Upstash Redis commands this month: Redis unreachable (fetch failed)",
      },
    ]);
    expect(currentIssues({}, [{ ...down, alertOnError: undefined }], NOW)).toEqual([]);
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
