import webpush from "web-push";
import { createWebPushSender } from "@/infrastructure/notifications/web-push-sender";

jest.mock("web-push", () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
const sendNotification = jest.mocked(webpush.sendNotification);

const logger = { warn: jest.fn() };
const CONFIG = { publicKey: "pub", privateKey: "priv", subject: "mailto:alerts@onecartapp.com", logger };
const SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bHUNbHUN",
  p256dh: "p256",
  auth: "secret",
};
const MESSAGE = { title: "Price dropped: JBL Charge 5", body: "Now ₪420", url: "/alerts", tag: "alert-1" };

/** What web-push rejects with: a WebPushError carrying the push service's answer. */
const pushError = (statusCode: number, body: string) =>
  Object.assign(new Error("Received unexpected response code"), {
    statusCode,
    body,
    endpoint: SUBSCRIPTION.endpoint,
  });

beforeEach(() => {
  sendNotification.mockReset();
  logger.warn.mockReset();
});

describe("createWebPushSender", () => {
  it("sends the message as JSON with our VAPID details and a one-day TTL", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toEqual({
      result: "sent",
      statusCode: 201,
      detail: null,
    });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: "p256", auth: "secret" } },
      JSON.stringify(MESSAGE),
      {
        vapidDetails: { subject: CONFIG.subject, publicKey: "pub", privateKey: "priv" },
        TTL: 86_400,
        urgency: "high",
        timeout: 10_000,
      },
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([404, 410])("reports HTTP %i as an expired subscription", async (statusCode) => {
    sendNotification.mockRejectedValue(
      pushError(statusCode, "push subscription has unsubscribed or expired.\n"),
    );
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toEqual({
      result: "expired",
      statusCode,
      detail: "push subscription has unsubscribed or expired.",
    });
  });

  it("returns and logs the push service's status and reason, never the full endpoint", async () => {
    // FCM's answer when the VAPID key doesn't match the one the browser subscribed with.
    sendNotification.mockRejectedValue(
      pushError(
        403,
        "the key in the authorization header does not correspond to the sender ID used to subscribe this user.",
      ),
    );
    const delivery = await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE);
    expect(delivery).toEqual({
      result: "failed",
      statusCode: 403,
      detail:
        "the key in the authorization header does not correspond to the sender ID used to subscribe this user.",
    });
    expect(logger.warn).toHaveBeenCalledWith("push: send failed", {
      endpoint: "fcm.googleapis.com/…dQw4w9WgXc",
      statusCode: 403,
      result: "failed",
      detail: delivery.detail,
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("APA91b");
  });

  it("reports a network error without a status, never throwing", async () => {
    sendNotification.mockRejectedValue(new Error("socket hang up"));
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toEqual({
      result: "failed",
      statusCode: null,
      detail: "socket hang up",
    });
  });

  it("works without a logger", async () => {
    sendNotification.mockRejectedValue(pushError(429, ""));
    const { logger: _ignored, ...withoutLogger } = CONFIG;
    expect((await createWebPushSender(withoutLogger).send(SUBSCRIPTION, MESSAGE)).detail).toBe(
      "Received unexpected response code",
    );
  });
});
