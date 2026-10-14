import webpush from "web-push";
import { createWebPushSender } from "@/infrastructure/notifications/web-push-sender";

jest.mock("web-push", () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
const sendNotification = jest.mocked(webpush.sendNotification);

const CONFIG = { publicKey: "pub", privateKey: "priv", subject: "mailto:alerts@onecartapp.com" };
const SUBSCRIPTION = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "p256", auth: "secret" };
const MESSAGE = { title: "Price dropped: JBL Charge 5", body: "Now ₪420", url: "/alerts", tag: "alert-1" };

beforeEach(() => sendNotification.mockReset());

describe("createWebPushSender", () => {
  it("sends the message as JSON with our VAPID details and a one-day TTL", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toBe("sent");
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: "p256", auth: "secret" } },
      JSON.stringify(MESSAGE),
      {
        vapidDetails: { subject: CONFIG.subject, publicKey: "pub", privateKey: "priv" },
        TTL: 86_400,
        urgency: "normal",
        timeout: 10_000,
      },
    );
  });

  it.each([404, 410])("reports HTTP %i as an expired subscription", async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode }));
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toBe("expired");
  });

  it("reports other failures as retryable, never throwing", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("throttled"), { statusCode: 429 }));
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toBe("failed");
    sendNotification.mockRejectedValue(new Error("socket hang up"));
    expect(await createWebPushSender(CONFIG).send(SUBSCRIPTION, MESSAGE)).toBe("failed");
  });
});
