import "server-only";

import webpush from "web-push";
import {
  endpointHint,
  type PushDelivery,
  type PushMessage,
  type PushSender,
  type PushSubscriptionKeys,
} from "@/domain/notifications/push";
import { noopLogger, type Logger } from "@/domain/shared/logger";

export interface WebPushSenderConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  /** "mailto:…" or an https URL the push services can reach us at. */
  readonly subject: string;
  readonly logger?: Logger;
}

/** A price drop is still news a day later; after that the push service may drop it. */
const TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 10_000;
/** Push services explain rejections in a short body; enough to diagnose, not a dump. */
const MAX_DETAIL = 300;

function field(error: unknown, name: "statusCode" | "body" | "message"): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, name) : undefined;
}

/** Sends through the `web-push` package (payload encryption, VAPID signature). */
export function createWebPushSender(config: WebPushSenderConfig): PushSender {
  const logger = config.logger ?? noopLogger;
  const vapidDetails = {
    subject: config.subject,
    publicKey: config.publicKey,
    privateKey: config.privateKey,
  };
  return {
    async send(subscription: PushSubscriptionKeys, message: PushMessage): Promise<PushDelivery> {
      try {
        // "high": a notification the user asked for; push services may hold back lower urgencies.
        const response = await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message),
          { vapidDetails, TTL: TTL_SECONDS, urgency: "high", timeout: TIMEOUT_MS },
        );
        return { result: "sent", statusCode: response.statusCode, detail: null };
      } catch (error) {
        const code = field(error, "statusCode");
        const statusCode = typeof code === "number" ? code : null;
        const body = field(error, "body");
        const text =
          typeof body === "string" && body.trim() ? body : String(field(error, "message") ?? error);
        const detail = text.trim().slice(0, MAX_DETAIL);
        // 404/410: the browser unsubscribed or the subscription expired; it will never work again.
        const result = statusCode === 404 || statusCode === 410 ? "expired" : "failed";
        logger.warn("push: send failed", {
          endpoint: endpointHint(subscription.endpoint),
          statusCode,
          result,
          detail,
        });
        return { result, statusCode, detail };
      }
    },
  };
}
