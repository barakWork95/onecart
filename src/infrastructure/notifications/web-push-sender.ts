import "server-only";

import webpush from "web-push";
import type { PushMessage, PushSender, PushSubscriptionKeys } from "@/domain/notifications/push";

export interface WebPushSenderConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  /** "mailto:…" or an https URL the push services can reach us at. */
  readonly subject: string;
}

/** A price drop is still news a day later; after that the push service may drop it. */
const TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 10_000;

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

/** Sends through the `web-push` package (payload encryption, VAPID signature). */
export function createWebPushSender(config: WebPushSenderConfig): PushSender {
  const vapidDetails = {
    subject: config.subject,
    publicKey: config.publicKey,
    privateKey: config.privateKey,
  };
  return {
    async send(subscription: PushSubscriptionKeys, message: PushMessage) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message),
          { vapidDetails, TTL: TTL_SECONDS, urgency: "normal", timeout: TIMEOUT_MS },
        );
        return "sent";
      } catch (error) {
        // 404/410: the browser unsubscribed or the subscription expired; it will never work again.
        const status = statusOf(error);
        return status === 404 || status === 410 ? "expired" : "failed";
      }
    },
  };
}
