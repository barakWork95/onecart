import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionResult } from "@/app/[lang]/saved/actions";
import { base64UrlToBytes, NotifyMe } from "@/components/features/user-lists/notify-me";

const PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const JSON_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) },
};

type Permission = "default" | "granted" | "denied";

/** Installs fake service worker, Push and Notification APIs; returns their spies. */
function installPush({
  permission = "default" as Permission,
  subscribed = false,
  ask = "granted" as Permission,
} = {}) {
  const subscription = {
    endpoint: JSON_SUB.endpoint,
    toJSON: () => JSON_SUB,
    unsubscribe: jest.fn(async () => true),
  };
  let current: typeof subscription | null = subscribed ? subscription : null;
  const pushManager = {
    getSubscription: jest.fn(async () => current),
    subscribe: jest.fn(async () => (current = subscription)),
  };
  const register = jest.fn(async () => ({ pushManager }));
  const Notification = { permission, requestPermission: jest.fn(async () => ask) };
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  Object.assign(window, { PushManager: function PushManager() {}, Notification });
  return { register, pushManager, subscription, Notification };
}

function uninstallPush() {
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
}

const ok = async (): Promise<ActionResult> => ({ ok: true, value: undefined });

function renderNotifyMe(
  save: jest.Mock<Promise<ActionResult>> = jest.fn(ok),
  remove: jest.Mock<Promise<ActionResult>> = jest.fn(ok),
) {
  render(<NotifyMe publicKey={PUBLIC_KEY} save={save} remove={remove} />);
  return { save, remove };
}

afterEach(uninstallPush);

describe("NotifyMe", () => {
  it("asks for permission only on a tap, then subscribes with our key and saves the subscription", async () => {
    const push = installPush();
    const { save } = renderNotifyMe();
    const button = await screen.findByRole("button", { name: "Turn on notifications" });
    expect(push.Notification.requestPermission).not.toHaveBeenCalled();

    await userEvent.click(button);
    expect(push.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(PUBLIC_KEY),
    });
    expect(save).toHaveBeenCalledWith(JSON_SUB);
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeInTheDocument();
    expect(push.register).toHaveBeenCalledWith("/sw.js");
  });

  it("shows as on when this browser is already subscribed, re-saves it, and turns off", async () => {
    const push = installPush({ permission: "granted", subscribed: true });
    const { remove, save } = renderNotifyMe();
    // The browser's current subscription, so the server never pushes to a replaced one.
    await waitFor(() => expect(save).toHaveBeenCalledWith(JSON_SUB));
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    expect(push.subscription.unsubscribe).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith({ endpoint: JSON_SUB.endpoint });
    expect(await screen.findByRole("button", { name: "Turn on notifications" })).toBeInTheDocument();
  });

  it("undoes the browser subscription when the server refuses it", async () => {
    const push = installPush();
    renderNotifyMe(
      jest.fn(async () => ({ ok: false as const, message: "Notifications aren't available right now." })),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(push.subscription.unsubscribe).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Notifications aren't available right now.");
    expect(screen.getByRole("button", { name: "Turn on notifications" })).toBeEnabled();
  });

  it("stays off when the prompt is dismissed, and explains when it's blocked", async () => {
    installPush({ ask: "default" });
    renderNotifyMe();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByRole("button", { name: "Turn on notifications" })).toBeEnabled();

    uninstallPush();
    installPush({ permission: "denied" });
    renderNotifyMe();
    expect(await screen.findByText(/Notifications are blocked for this site/)).toBeInTheDocument();
  });

  it("tells iPhone visitors to add the site to the Home Screen first", async () => {
    const ua = jest
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    renderNotifyMe();
    expect(await screen.findByText(/add OneCart to your Home Screen/)).toBeInTheDocument();
    ua.mockRestore();
  });

  it("says when the browser can't do notifications at all", async () => {
    renderNotifyMe();
    expect(await screen.findByText(/This browser can.t show notifications/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
  });
});

describe("NotifyMe as a list switch (ops alerts)", () => {
  const COPY = {
    label: "Ops alerts",
    off: "Send ops alerts to this browser.",
    on: "Ops alerts come to this browser.",
  };

  it("is off for a subscribed browser the server doesn't list, and doesn't enrol it on its own", async () => {
    installPush({ permission: "granted", subscribed: true });
    const save = jest.fn(ok);
    render(
      <NotifyMe
        publicKey={PUBLIC_KEY}
        save={save}
        remove={jest.fn(ok)}
        copy={COPY}
        keepBrowserSubscription
        isSaved={async () => false}
      />,
    );
    expect(await screen.findByText(COPY.off)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("turning off removes it from the list but keeps the browser subscribed", async () => {
    const push = installPush({ permission: "granted", subscribed: true });
    const remove = jest.fn(ok);
    render(
      <NotifyMe
        publicKey={PUBLIC_KEY}
        save={jest.fn(ok)}
        remove={remove}
        copy={COPY}
        keepBrowserSubscription
        isSaved={async () => true}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    expect(remove).toHaveBeenCalledWith({ endpoint: JSON_SUB.endpoint });
    expect(push.subscription.unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Ops alerts" })).toBeInTheDocument();
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url without padding", () => {
    expect([...base64UrlToBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});
