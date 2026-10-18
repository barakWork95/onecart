"use client";

import { Bell, BellOff, Share } from "lucide-react";
import { useEffect, useState } from "react";
import type { ActionResult } from "@/app/saved/actions";

type State =
  | "checking"
  /** No service workers / Push API (old browser, private mode in some). */
  | "unsupported"
  /** iPhone/iPad Safari: Web Push works only once added to the Home Screen. */
  | "ios_install"
  | "denied"
  | "off"
  | "on"
  | "busy";

const SW_URL = "/sw.js";

const DEFAULT_COPY = {
  label: "Price-alert notifications",
  off: "Get a notification when a price hits your target.",
  on: "Notifications are on: this browser hears from us when a price hits your target.",
} as const;

/** VAPID keys are base64url; PushManager wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Turns price-alert notifications on or off for this browser. The permission
 * prompt only ever follows a tap, never a page load.
 */
export function NotifyMe({
  publicKey,
  save,
  remove,
  copy = DEFAULT_COPY,
  keepBrowserSubscription = false,
  isSaved,
}: {
  publicKey: string;
  save: (subscription: PushSubscriptionJSON) => Promise<ActionResult>;
  remove: (input: { endpoint: string }) => Promise<ActionResult>;
  /** The panel's name and its off/on sentences. */
  copy?: { readonly label: string; readonly off: string; readonly on: string };
  /**
   * Turning off only removes this browser from the server's list; the browser
   * stays subscribed (its other notifications, e.g. price alerts, keep working).
   */
  keepBrowserSubscription?: boolean;
  /**
   * Whether the server already has this browser on its list. Without it, any
   * subscription counts as on (the browser's one subscription serves the list).
   */
  isSaved?: (input: { endpoint: string }) => Promise<boolean>;
}) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: State) => !cancelled && setState(next);
    (async () => {
      if (!pushSupported()) return settle(isIos() && !isStandalone() ? "ios_install" : "unsupported");
      if (Notification.permission === "denied") return settle("denied");
      try {
        const registration = await navigator.serviceWorker.register(SW_URL);
        const subscription = await registration.pushManager.getSubscription();
        const on =
          !!subscription &&
          Notification.permission === "granted" &&
          (!isSaved || (await isSaved({ endpoint: subscription.endpoint })));
        settle(on ? "on" : "off");
        // Browsers replace subscriptions over time (and on site-data resets); the server
        // must push to this one, so it's re-saved on every visit. Idempotent.
        if (on) await save(subscription.toJSON());
      } catch {
        settle("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [save, isSaved]);

  async function turnOn() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register(SW_URL);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      const result = await save(subscription.toJSON());
      if (result.ok) return setState("on");
      await subscription.unsubscribe();
      setError(result.message);
      setState("off");
    } catch {
      setError("Couldn't turn on notifications in this browser. Please try again.");
      setState("off");
    }
  }

  async function turnOff() {
    setError(null);
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.register(SW_URL);
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        if (!keepBrowserSubscription) await subscription.unsubscribe();
        await remove({ endpoint });
      }
      setState("off");
    } catch {
      setError("Couldn't turn off notifications. Please try again.");
      setState("on");
    }
  }

  if (state === "checking") return null;

  const box =
    "flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between";
  const button =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 font-semibold disabled:opacity-60";

  return (
    <section aria-label={copy.label} className={box}>
      {state === "unsupported" && (
        <p className="text-muted-foreground">
          This browser can&apos;t show notifications. Drops still show up on this page.
        </p>
      )}
      {state === "ios_install" && (
        <p className="flex items-start gap-2 text-muted-foreground">
          <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            To get notifications on iPhone, add OneCart to your Home Screen (Share → Add to Home Screen), then
            open it from there.
          </span>
        </p>
      )}
      {state === "denied" && (
        <p className="text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then
          reload this page.
        </p>
      )}
      {(state === "off" || state === "on" || state === "busy") && (
        <>
          <p className="text-foreground">{state === "on" ? copy.on : copy.off}</p>
          {state === "on" ? (
            <button
              type="button"
              onClick={turnOff}
              className={`${button} border border-border text-foreground`}
            >
              <BellOff className="size-4" aria-hidden />
              Turn off
            </button>
          ) : (
            <button
              type="button"
              onClick={turnOn}
              disabled={state === "busy"}
              className={`${button} bg-primary text-primary-foreground`}
            >
              <Bell className="size-4" aria-hidden />
              {state === "busy" ? "Working…" : "Turn on notifications"}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
