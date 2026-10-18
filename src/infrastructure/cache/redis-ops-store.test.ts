import type { CronRun } from "@/domain/ops/cron-run";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { createRedisOpsStore, opsRunKey } from "@/infrastructure/cache/redis-ops-store";

const run = (ok: boolean, finishedAt: string): CronRun => ({
  job: "warm-trending",
  startedAt: finishedAt,
  finishedAt,
  ok,
  problems: ok ? [] : ["ebay: all 65 searches failed"],
});

describe("createRedisOpsStore", () => {
  it("keeps each job's last run and last ok run", async () => {
    const store = createRedisOpsStore(createInMemoryRedis());
    expect(await store.history()).toEqual({});
    const good = run(true, "2026-10-18T07:30:30.000Z");
    const bad = run(false, "2026-10-19T07:30:30.000Z");
    await store.recordRun(good);
    await store.recordRun(bad);
    expect(await store.history()).toEqual({ "warm-trending": { last: bad, lastOk: good } });
  });

  it("starts without a last ok run, and ignores entries it didn't write", async () => {
    const redis = createInMemoryRedis();
    const store = createRedisOpsStore(redis);
    await store.recordRun(run(false, "2026-10-19T07:30:30.000Z"));
    expect((await store.history())["warm-trending"]?.lastOk).toBeNull();
    await redis.set(opsRunKey("price-alerts"), { last: "garbage" }, { ex: 60 });
    expect(Object.keys(await store.history())).toEqual(["warm-trending"]);
  });
});
