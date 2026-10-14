/** A browser's Web Push subscription, as `PushSubscription.toJSON()` gives it. */
export interface PushSubscriptionKeys {
  readonly endpoint: string;
  /** Browser's P-256 public key, base64url. */
  readonly p256dh: string;
  /** Auth secret, base64url. */
  readonly auth: string;
}

/** What a notification shows; no secrets, nothing beyond what the Alerts page shows. */
export interface PushMessage {
  readonly title: string;
  readonly body: string;
  /** Opened on click; same-origin path. */
  readonly url: string;
  /** Collapses repeats for the same alert into one notification. */
  readonly tag: string;
}

/**
 * - `sent`: accepted by the push service;
 * - `expired`: the subscription is gone (404/410), delete it;
 * - `failed`: anything else, retry on the next run.
 */
export type PushResult = "sent" | "expired" | "failed";

export interface PushSender {
  send(subscription: PushSubscriptionKeys, message: PushMessage): Promise<PushResult>;
}

/**
 * The push services of the major browsers. The server POSTs to a saved
 * endpoint, so only these hosts are ever accepted (the database checks the
 * same list): anything else would let a visitor point our server at any URL.
 */
const PUSH_SERVICE_HOSTS = [
  { host: "fcm.googleapis.com", subdomains: false }, // Chrome, Edge, Android
  { host: "push.services.mozilla.com", subdomains: true }, // Firefox
  { host: "push.apple.com", subdomains: true }, // Safari (macOS, iOS home-screen apps)
  { host: "notify.windows.com", subdomains: true }, // legacy Edge
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || endpoint.length > 1000)
    return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((s) => host === s.host || (s.subdomains && host.endsWith(`.${s.host}`)));
}
