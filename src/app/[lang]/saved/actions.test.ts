import { setSavedAction } from "@/app/[lang]/saved/actions";

const saveProduct = jest.fn();
let repo: object | null = {};
jest.mock("@/app/_user-lists", () => ({
  userListsService: { saveProduct: (...args: unknown[]) => saveProduct(...args), removeSaved: jest.fn() },
  writeUserLists: async () => repo,
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const input = { productId: "ebay:1", searchText: "jbl flip 6", saved: true };

beforeEach(() => {
  repo = {};
  saveProduct.mockReset();
});

describe("setSavedAction", () => {
  it("explains a failure in the page's language", async () => {
    saveProduct.mockResolvedValue({ ok: false, error: "limit_reached" });
    expect(await setSavedAction({ ...input, locale: "he" })).toEqual({
      ok: false,
      message: "הגעת למגבלת הפריטים השמורים. הסירו חלק כדי לשמור עוד.",
    });
    expect(await setSavedAction(input)).toEqual({
      ok: false,
      message: "You've reached the saved-items limit. Remove some to save more.",
    });
  });

  it("reads an unknown language as English, and says when saving is unavailable", async () => {
    repo = null;
    expect(await setSavedAction({ ...input, locale: "fr" })).toEqual({
      ok: false,
      message: "Saving isn't available right now.",
    });
    expect(await setSavedAction({ ...input, locale: "he" })).toEqual({
      ok: false,
      message: "השמירה לא זמינה כרגע.",
    });
  });

  it("rejects malformed input in the page's language", async () => {
    expect(await setSavedAction({ locale: "he" })).toEqual({ ok: false, message: "הבקשה לא תקינה." });
  });
});
