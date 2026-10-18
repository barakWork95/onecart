import { createRecordCronRun } from "@/application/ops/record-cron-run";
import type { CronRun } from "@/domain/ops/cron-run";
import type { OpsStore } from "@/domain/ops/ports";

function fakeStore() {
  const runs: CronRun[] = [];
  const store: OpsStore & { runs: CronRun[] } = {
    runs,
    async recordRun(run) {
      runs.push(run);
    },
    async history() {
      return {};
    },
  };
  return store;
}

const clock = () => {
  let ms = Date.parse("2026-10-19T07:30:00.000Z");
  return () => new Date((ms += 1000));
};

describe("recordCronRun", () => {
  it("records an ok run and returns the work's result", async () => {
    const store = fakeStore();
    const record = createRecordCronRun({ store, now: clock() });
    const { result, run } = await record(
      "warm-trending",
      async () => 42,
      () => [],
    );
    expect(result).toBe(42);
    expect(run).toEqual({
      job: "warm-trending",
      startedAt: "2026-10-19T07:30:01.000Z",
      finishedAt: "2026-10-19T07:30:02.000Z",
      ok: true,
      problems: [],
    });
    expect(store.runs).toEqual([run]);
  });

  it("records the problems a completed run reported as not ok", async () => {
    const store = fakeStore();
    const { run } = await createRecordCronRun({ store, now: clock() })(
      "price-alerts",
      async () => ({ failed: 2 }),
      (r) => [`${r.failed} failed`],
    );
    expect(run).toMatchObject({ ok: false, problems: ["2 failed"] });
  });

  it("records a thrown run, then rethrows", async () => {
    const store = fakeStore();
    const record = createRecordCronRun({ store, now: clock() });
    await expect(
      record(
        "warm-trending",
        () => Promise.reject(new Error("redis down")),
        () => [],
      ),
    ).rejects.toThrow("redis down");
    expect(store.runs[0]).toMatchObject({ ok: false, problems: ["the run threw: redis down"] });
  });

  it("never fails the cron when recording fails", async () => {
    const logger = { warn: jest.fn() };
    const store = { ...fakeStore(), recordRun: () => Promise.reject(new Error("no redis")) };
    const { result } = await createRecordCronRun({ store, logger })(
      "warm-trending",
      async () => "done",
      () => [],
    );
    expect(result).toBe("done");
    expect(logger.warn).toHaveBeenCalledWith("ops: recording a cron run failed", {
      job: "warm-trending",
      error: "no redis",
    });
  });
});
