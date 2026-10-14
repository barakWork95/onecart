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

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show a generic notification rather than nothing.
  }
  const title = typeof message.title === "string" ? message.title : "OneCart price alert";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "A price you're watching dropped.",
      tag: typeof message.tag === "string" ? message.tag : undefined,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: safePath(message.url) },
    }),
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
