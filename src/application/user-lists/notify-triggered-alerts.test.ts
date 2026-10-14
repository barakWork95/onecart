import { alertMessage, createNotifyTriggeredAlerts } from "@/application/user-lists/notify-triggered-alerts";
import type { DeliveryOutcome, PushDirectory, StoredSubscription } from "@/domain/notifications/ports";
import type { PushMessage, PushResult, PushSender } from "@/domain/notifications/push";
import { money } from "@/domain/shared/money";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { OwnedAlert, TriggeredAlertRepository } from "@/domain/user-lists/ports";

const NOW = new Date("2026-10-15T05:00:00.000Z");

const alert = (id: string, triggeredAt = "2026-10-15T05:00:00.000Z"): PriceAlert => ({
  id,
  productId: `ebay:${id}`,
  provider: "ebay",
  title: "JBL Charge 5 Portable Bluetooth Speaker — Black, Waterproof, PartyBoost, 20 Hours Playtime",
  imageUrl: null,
  productUrl: `https://www.ebay.com/itm/${id}`,
  searchText: "jbl charge 5",
  target: money(450_00, "ILS"),
  baseline: money(520_00, "ILS"),
  lastSeen: money(429_90, "ILS"),
  lastCheckedAt: triggeredAt,
  status: "triggered",
  triggeredAt,
  createdAt: "2026-10-10T08:00:00.000Z",
});

const sub = (userId: string, n: number, failureCount = 0): StoredSubscription => ({
  userId,
  endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${n}`,
  p256dh: "p".repeat(87),
  auth: "a".repeat(22),
  failureCount,
});

function setup(
  owned: OwnedAlert[],
  subscriptions: StoredSubscription[],
  results: Record<string, PushResult> = {},
) {
  const marked: { ids: readonly string[]; at: string }[] = [];
  const alerts: TriggeredAlertRepository = {
    listUnnotified: async () => owned,
    markNotified: async (ids, at) => void marked.push({ ids, at }),
  };
  const recorded: DeliveryOutcome[][] = [];
  const directory: PushDirectory = {
    subscriptionsFor: async (ids) => subscriptions.filter((s) => ids.includes(s.userId)),
    recordDeliveries: async (outcomes) => void recorded.push([...outcomes]),
  };
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const sender: PushSender = {
    send: async (s, message) => {
      sent.push({ endpoint: s.endpoint, message });
      const result = results[s.endpoint] ?? "sent";
      return { result, statusCode: result === "sent" ? 201 : 410, detail: null };
    },
  };
  const notify = createNotifyTriggeredAlerts({ alerts, directory, sender, now: () => NOW });
  return { notify, marked, recorded, sent };
}

describe("notifyTriggeredAlerts", () => {
  it("pushes each triggered alert to every browser its owner subscribed, once", async () => {
    const { notify, marked, sent, recorded } = setup(
      [{ userId: "u1", alert: alert("a1") }],
      [sub("u1", 1), sub("u1", 2), sub("u2", 1)],
    );
    expect(await notify()).toEqual({ alerts: 1, notified: 1, sent: 2, expired: 0, failed: 0, skipped: 0 });
    expect(sent.map((s) => s.endpoint)).toEqual([sub("u1", 1).endpoint, sub("u1", 2).endpoint]);
    expect(sent[0]?.message).toEqual({
      title: "Price drop: JBL Charge 5 Portable Bluetooth Speaker — Black, Waterpr…",
      body: "Now ₪429.90 — your target was ₪450.00.",
      url: "/alerts",
      tag: "alert-a1",
    });
    expect(marked).toEqual([{ ids: ["a1"], at: NOW.toISOString() }]);
    expect(recorded[0]?.map((o) => o.result)).toEqual(["sent", "sent"]);
  });

  it("leaves an alert for the next run when every send failed, and drops expired subscriptions", async () => {
    const { notify, marked, recorded } = setup(
      [{ userId: "u1", alert: alert("a1") }],
      [sub("u1", 1), sub("u1", 2)],
      { [sub("u1", 1).endpoint]: "failed", [sub("u1", 2).endpoint]: "expired" },
    );
    expect(await notify()).toEqual({ alerts: 1, notified: 0, sent: 0, expired: 1, failed: 1, skipped: 0 });
    expect(marked).toEqual([]);
    expect(recorded[0]?.map((o) => o.result)).toEqual(["failed", "expired"]);
  });

  it("marks alerts with nobody to notify, or triggered days ago, as handled without sending", async () => {
    const { notify, marked, sent } = setup(
      [
        { userId: "u-none", alert: alert("a1") },
        { userId: "u1", alert: alert("old", "2026-10-11T05:00:00.000Z") },
      ],
      [sub("u1", 1)],
    );
    expect(await notify()).toEqual({ alerts: 2, notified: 0, sent: 0, expired: 0, failed: 0, skipped: 2 });
    expect(sent).toEqual([]);
    expect(marked).toEqual([{ ids: ["a1", "old"], at: NOW.toISOString() }]);
  });

  it("does nothing when no alert is waiting", async () => {
    const { notify, marked, recorded } = setup([], [sub("u1", 1)]);
    expect(await notify()).toEqual({ alerts: 0, notified: 0, sent: 0, expired: 0, failed: 0, skipped: 0 });
    expect(marked).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("still marks pushed alerts when recording deliveries fails", async () => {
    const marked: { ids: readonly string[]; at: string }[] = [];
    const logger = { warn: jest.fn() };
    const failing = createNotifyTriggeredAlerts({
      alerts: {
        listUnnotified: async () => [{ userId: "u1", alert: alert("a1") }],
        markNotified: async (ids, at) => void marked.push({ ids, at }),
      },
      directory: {
        subscriptionsFor: async () => [sub("u1", 1)],
        recordDeliveries: () => Promise.reject(new Error("db down")),
      },
      sender: { send: async () => ({ result: "sent", statusCode: 201, detail: null }) },
      now: () => NOW,
      logger,
    });
    expect((await failing()).notified).toBe(1);
    expect(marked).toEqual([{ ids: ["a1"], at: NOW.toISOString() }]);
    expect(logger.warn).toHaveBeenCalledWith("push: recording deliveries failed", { error: "db down" });
  });
});

describe("alertMessage", () => {
  it("says the price reached the target when today's price isn't known", () => {
    expect(alertMessage({ ...alert("a1"), lastSeen: null }).body).toBe("It reached your target of ₪450.00.");
  });
});
