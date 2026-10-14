import { isAllowedPushEndpoint } from "@/domain/notifications/push";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
  ])("accepts the browsers' push services: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["any other host", "https://evil.example/push"],
    ["a look-alike host", "https://fcm.googleapis.com.evil.example/x"],
    ["a subdomain where none is allowed", "https://x.fcm.googleapis.com/x"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
    ["a port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["credentials", "https://user:pw@fcm.googleapis.com/fcm/send/x"],
    ["not a URL", "fcm.googleapis.com/fcm/send/x"],
    ["an over-long URL", `https://fcm.googleapis.com/fcm/send/${"x".repeat(1000)}`],
  ])("rejects %s", (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
