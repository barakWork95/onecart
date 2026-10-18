import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { createRedisOpsAlertState, OPS_ISSUES_KEY } from "@/infrastructure/cache/redis-ops-alert-state";

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: "p", auth: "a" });

describe("createRedisOpsAlertState", () => {
  it("round-trips the alerted issues, reading anything else as none", async () => {
    const redis = createInMemoryRedis();
    const state = createRedisOpsAlertState(redis);
    expect(await state.activeIssues()).toEqual([]);
    await state.saveActiveIssues([{ key: "stale:price-alerts", message: "price-alerts hasn't run" }]);
    expect(await state.activeIssues()).toEqual([
      { key: "stale:price-alerts", message: "price-alerts hasn't run" },
    ]);
    await redis.set(OPS_ISSUES_KEY, "garbage", { ex: 60 });
    expect(await state.activeIssues()).toEqual([]);
  });

  it("keeps up to five admin browsers, newest first, without duplicates", async () => {
    const state = createRedisOpsAlertState(createInMemoryRedis());
    for (const n of [1, 2, 3, 4, 5, 6, 2]) await state.addTarget(sub(n));
    expect((await state.targets()).map((t) => t.endpoint.slice(-1))).toEqual(["2", "6", "5", "4", "3"]);
    await state.removeTarget(sub(6).endpoint);
    expect(await state.targets()).toHaveLength(4);
  });
});
