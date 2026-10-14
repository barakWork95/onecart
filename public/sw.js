/*
 * OneCart service worker: price-alert notifications only. No caching, no
 * fetch handler, so it never changes how pages load.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Same-origin paths only: a push message can never send the browser elsewhere. */
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/alerts";
}

/** The push's JSON message, or {} for anything else (DevTools sends plain text). */
function readMessage(data) {
  if (!data) return {};
  try {
    const parsed = JSON.parse(data.text());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const text = (value, fallback) => (typeof value === "string" && value.trim() ? value : fallback);

self.addEventListener("push", (event) => {
  const message = readMessage(event.data);
  const title = text(message.title, "OneCart price alert");
  const options = {
    body: text(message.body, "A price you're watching dropped."),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: safePath(message.url) },
  };
  // A tag replaces an earlier notification with the same tag; without `renotify` the
  // replacement is silent (no banner), e.g. when the last one is still in Notification Center.
  if (typeof message.tag === "string" && message.tag)
    Object.assign(options, { tag: message.tag, renotify: true });
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      // Options a browser rejects must not cost the user the alert: retry with the bare minimum.
      .catch(() => self.registration.showNotification(title, { body: options.body, data: options.data })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === url.pathname);
      return open ? open.focus() : self.clients.openWindow(url.href);
    }),
  );
});
