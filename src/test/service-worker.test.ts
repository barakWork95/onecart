import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

type Listener = (event: Record<string, unknown>) => void;

/** Runs public/sw.js in a sandbox with a fake `self`, returning its listeners and spies. */
function loadServiceWorker({ rejectFirstShow = false } = {}) {
  const listeners = new Map<string, Listener>();
  let shows = 0;
  const showNotification = jest.fn(async () => {
    shows++;
    if (rejectFirstShow && shows === 1) throw new TypeError("bad option");
  });
  const clients = {
    matchAll: jest.fn(async () => []),
    openWindow: jest.fn(async () => null),
    claim: jest.fn(),
  };
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients,
    skipWaiting: jest.fn(),
    location: { origin: "https://www.onecartapp.com" },
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), { self, URL });
  return { listeners, showNotification, clients };
}

async function push(sw: ReturnType<typeof loadServiceWorker>, data: string | null) {
  let pending: Promise<unknown> = Promise.resolve();
  sw.listeners.get("push")?.({
    data: data === null ? null : { text: () => data },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
}

describe("public/sw.js", () => {
  it("shows our JSON message, re-alerting when it replaces one with the same tag", async () => {
    const sw = loadServiceWorker();
    await push(
      sw,
      JSON.stringify({ title: "Price drop: JBL", body: "Now ₪420", url: "/alerts", tag: "alert-1" }),
    );
    expect(sw.showNotification).toHaveBeenCalledWith("Price drop: JBL", {
      body: "Now ₪420",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/alerts" },
      tag: "alert-1",
      renotify: true,
    });
  });

  it("falls back to a generic notification for plain text, bad JSON or no data", async () => {
    for (const data of ["Test push message from DevTools.", "{oops", null, "42"]) {
      const sw = loadServiceWorker();
      await push(sw, data);
      expect(sw.showNotification).toHaveBeenCalledWith("OneCart price alert", {
        body: "A price you're watching dropped.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/alerts" },
      });
    }
  });

  it("retries with bare options when the browser rejects the first try", async () => {
    const sw = loadServiceWorker({ rejectFirstShow: true });
    await push(sw, JSON.stringify({ title: "T", body: "B", tag: "x", url: "/alerts" }));
    expect(sw.showNotification).toHaveBeenCalledTimes(2);
    expect(sw.showNotification).toHaveBeenLastCalledWith("T", { body: "B", data: { url: "/alerts" } });
  });

  it("only ever opens same-origin paths on click", async () => {
    const sw = loadServiceWorker();
    const close = jest.fn();
    let pending: Promise<unknown> = Promise.resolve();
    sw.listeners.get("notificationclick")?.({
      notification: { close, data: { url: "//evil.example/x" } },
      waitUntil: (p: Promise<unknown>) => (pending = p),
    });
    await pending;
    expect(close).toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalledWith("https://www.onecartapp.com/alerts");
  });
});
