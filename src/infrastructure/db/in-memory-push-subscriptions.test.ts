import { createInMemoryPushSubscriptions } from "@/infrastructure/db/in-memory-push-subscriptions";

const KEYS = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: "p".repeat(87),
  auth: "a".repeat(22),
  locale: "en" as const,
};

describe("createInMemoryPushSubscriptions", () => {
  it("keeps users apart and follows the delivery rules", async () => {
    const store = createInMemoryPushSubscriptions();
    await store.forUser("u1").save(KEYS);
    await store.forUser("u2").save({ ...KEYS, locale: "he" });
    const [u1] = await store.directory.subscriptionsFor(["u1"]);
    expect(u1).toEqual({ ...KEYS, userId: "u1", failureCount: 0 });
    expect((await store.directory.subscriptionsFor(["u2"]))[0]?.locale).toBe("he");

    await store.directory.recordDeliveries([{ subscription: u1!, result: "failed" }], 2);
    const [after] = await store.directory.subscriptionsFor(["u1"]);
    expect(after?.failureCount).toBe(1);
    await store.directory.recordDeliveries([{ subscription: after!, result: "sent" }], 2);
    expect((await store.directory.subscriptionsFor(["u1"]))[0]?.failureCount).toBe(0);
    await store.directory.recordDeliveries(
      [{ subscription: { ...after!, failureCount: 1 }, result: "failed" }],
      2,
    );
    expect(await store.directory.subscriptionsFor(["u1"])).toEqual([]);

    const [u2] = await store.directory.subscriptionsFor(["u2"]);
    await store.directory.recordDeliveries([{ subscription: u2!, result: "expired" }], 5);
    expect(await store.directory.subscriptionsFor(["u2"])).toEqual([]);
  });

  it("removes a user's own subscription only", async () => {
    const store = createInMemoryPushSubscriptions();
    await store.forUser("u1").save(KEYS);
    await store.forUser("u2").remove(KEYS.endpoint);
    expect(await store.directory.subscriptionsFor(["u1"])).toHaveLength(1);
    await store.forUser("u1").remove(KEYS.endpoint);
    expect(await store.directory.subscriptionsFor(["u1"])).toEqual([]);
  });
});
