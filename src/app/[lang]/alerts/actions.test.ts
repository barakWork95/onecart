import { createAlertAction, savePushSubscriptionAction } from "@/app/[lang]/alerts/actions";
import { money } from "@/domain/shared/money";

const createAlert = jest.fn();
const savePush = jest.fn();
jest.mock("@/app/_user-lists", () => ({
  userListsService: { createAlert: (...args: unknown[]) => createAlert(...args) },
  writeUserLists: async () => ({}),
  writePushSubscriptions: async () => ({ save: (s: unknown) => savePush(s), remove: jest.fn() }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const plain = (s: string) => s.replace(/‏/g, "").replace(/ /g, " ");
const alert = { productId: "ebay:1", searchText: "jbl flip 6", targetShekels: "450" };

beforeEach(() => {
  createAlert.mockReset();
  savePush.mockReset();
});

describe("createAlertAction", () => {
  it("answers in Hebrew: the error, and the confirmed target number-first", async () => {
    createAlert.mockResolvedValueOnce({ ok: false, error: "target_not_below_current" });
    expect(await createAlertAction({ ...alert, locale: "he" })).toEqual({
      ok: false,
      message: "בחרו מחיר יעד נמוך מהמחיר של היום.",
    });
    createAlert.mockResolvedValueOnce({ ok: true, value: { target: money(450_00, "ILS") } });
    const ok = await createAlertAction({ ...alert, locale: "he" });
    expect(ok.ok && plain(ok.value.target)).toBe("450.00 ₪");
  });

  it("keeps English as the default", async () => {
    createAlert.mockResolvedValueOnce({ ok: false, error: "limit_reached" });
    expect(await createAlertAction(alert)).toEqual({
      ok: false,
      message: "You've reached the price-alert limit. Delete one to add another.",
    });
  });
});

describe("savePushSubscriptionAction", () => {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) },
  };

  it("saves the browser's subscription with the language it signed up in", async () => {
    expect(await savePushSubscriptionAction({ ...subscription, locale: "he" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(savePush).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      ...subscription.keys,
      locale: "he",
    });
    await savePushSubscriptionAction(subscription);
    expect(savePush).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("explains an unsupported browser in its language", async () => {
    expect(await savePushSubscriptionAction({ endpoint: "https://evil.example/x", locale: "he" })).toEqual({
      ok: false,
      message: "הגדרת ההתראות של הדפדפן הזה לא נתמכת.",
    });
  });
});
