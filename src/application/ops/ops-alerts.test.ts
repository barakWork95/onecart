import { createCheckOpsAlerts, opsAlertMessage } from "@/application/ops/ops-alerts";
import type { PushMessage, PushResult, PushSubscriptionKeys } from "@/domain/notifications/push";
import type { CronJob, CronJobHistory, CronRun } from "@/domain/ops/cron-run";
import type { OpsIssue } from "@/domain/ops/issues";
import type { OpsAlertState, OpsStore } from "@/domain/ops/ports";
import type { QuotaReading } from "@/domain/ops/status";

const NOW = new Date("2026-10-19T08:00:00.000Z");
const run = (job: CronJob, ok: boolean, problems: string[] = []): CronRun => ({
  job,
  startedAt: "2026-10-19T07:30:00.000Z",
  finishedAt: "2026-10-19T07:30:31.000Z",
  ok,
  problems,
});
const healthy: Partial<Record<CronJob, CronJobHistory>> = {
  "warm-trending": { last: run("warm-trending", true), lastOk: null },
  "price-alerts": { last: run("price-alerts", true), lastOk: null },
};
const serpApi = (remaining: number): QuotaReading => ({
  name: "SerpApi searches this month (Amazon)",
  used: 250 - remaining,
  limit: 250,
  remaining,
  resetsAt: null,
  error: null,
});
const TARGET: PushSubscriptionKeys = {
  endpoint: "https://fcm.googleapis.com/fcm/send/admin",
  p256dh: "p",
  auth: "a",
};

function setup({
  history = healthy,
  quotas = [serpApi(120)],
  active = [] as OpsIssue[],
  targets = [TARGET],
  result = "sent" as PushResult,
  sender = true,
} = {}) {
  const saved: (readonly OpsIssue[])[] = [];
  const removed: string[] = [];
  const state: OpsAlertState = {
    activeIssues: async () => active,
    saveActiveIssues: async (issues) => void saved.push(issues),
    targets: async () => targets,
    addTarget: async () => undefined,
    removeTarget: async (endpoint) => void removed.push(endpoint),
  };
  const ops: OpsStore = { recordRun: async () => undefined, history: async () => history };
  const send = jest.fn(async (_target: PushSubscriptionKeys, _message: PushMessage) => ({
    result,
    statusCode: result === "sent" ? 201 : 410,
    detail: null,
  }));
  const check = createCheckOpsAlerts({
    ops,
    quotas: [{ read: async () => quotas }],
    state,
    sender: sender ? { send } : null,
    now: () => NOW,
  });
  return { check, saved, removed, send };
}

describe("checkOpsAlerts", () => {
  it("alerts the admin browsers about a new problem once, then stays quiet while it lasts", async () => {
    const first = setup({ quotas: [serpApi(0)] });
    expect(await first.check()).toEqual({
      issues: 1,
      raised: ["quota:SerpApi searches this month (Amazon)"],
      resolved: [],
      delivered: 1,
    });
    expect(first.send).toHaveBeenCalledWith(TARGET, {
      title: "OneCart: 1 new problem",
      body: "⚠ SerpApi searches this month (Amazon): none left",
      url: "/internal/status",
      tag: `ops-${NOW.getTime()}`,
    });
    expect(first.saved).toEqual([
      [
        {
          key: "quota:SerpApi searches this month (Amazon)",
          message: "SerpApi searches this month (Amazon): none left",
        },
      ],
    ]);

    const again = setup({ quotas: [serpApi(0)], active: first.saved[0] as OpsIssue[] });
    expect((await again.check()).delivered).toBe(0);
    expect(again.send).not.toHaveBeenCalled();
  });

  it("says when a problem clears", async () => {
    const { check, send, saved } = setup({
      active: [{ key: "run:warm-trending", message: "warm-trending: ebay failed" }],
    });
    expect(await check()).toMatchObject({ resolved: ["run:warm-trending"], delivered: 1 });
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      title: "OneCart: back to normal",
      body: "✓ Recovered: warm-trending: ebay failed",
    });
    expect(saved).toEqual([[]]);
  });

  it("retries next run when no admin browser accepted the alert, dropping expired ones", async () => {
    const { check, saved, removed } = setup({ quotas: [serpApi(0)], result: "expired" });
    expect((await check()).delivered).toBe(0);
    expect(saved).toEqual([]);
    expect(removed).toEqual([TARGET.endpoint]);
  });

  it("tracks issues without a sender or target, so turning alerts on later doesn't replay old ones", async () => {
    for (const options of [{ sender: false }, { targets: [] }]) {
      const { check, saved } = setup({ quotas: [serpApi(0)], ...options });
      expect(await check()).toMatchObject({
        raised: ["quota:SerpApi searches this month (Amazon)"],
        delivered: 0,
      });
      expect(saved).toHaveLength(1);
    }
  });
});

describe("opsAlertMessage", () => {
  it("keeps the banner short", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      message: `problem number ${i} with a long description`,
    }));
    const message = opsAlertMessage(many, [], NOW);
    expect(message.title).toBe("OneCart: 10 new problems");
    expect(message.body.length).toBe(180);
    expect(message.body.endsWith("…")).toBe(true);
  });
});
