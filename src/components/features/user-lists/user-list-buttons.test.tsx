import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { track } from "@vercel/analytics";
import { RemoveButton } from "@/components/features/user-lists/remove-button";
import { SaveButton } from "@/components/features/user-lists/save-button";
import { TrackPriceButton } from "@/components/features/user-lists/track-price-button";

jest.mock("@vercel/analytics", () => ({ track: jest.fn() }));
const tracked = track as jest.MockedFunction<typeof track>;
const setSavedAction = jest.fn();
const createAlertAction = jest.fn();
jest.mock("@/app/[lang]/saved/actions", () => ({
  setSavedAction: (input: unknown) => setSavedAction(input),
}));
jest.mock("@/app/[lang]/alerts/actions", () => ({
  createAlertAction: (input: unknown) => createAlertAction(input),
}));

beforeEach(() => {
  tracked.mockReset();
  setSavedAction.mockReset();
  createAlertAction.mockReset();
});

const REF = { productId: "aliexpress:1", searchText: "אוזניות אלחוטיות", title: "Life P3" };

describe("SaveButton", () => {
  it("saves optimistically, sending only the product id and search", async () => {
    setSavedAction.mockResolvedValue({ ok: true, value: { saved: true } });
    render(<SaveButton {...REF} initialSaved={false} priceIls={89} />);

    await userEvent.click(screen.getByRole("button", { name: "Save Life P3" }));
    expect(screen.getByRole("button", { name: "Remove Life P3 from Saved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(setSavedAction).toHaveBeenCalledWith({
      productId: "aliexpress:1",
      searchText: "אוזניות אלחוטיות",
      saved: true,
      locale: "en",
    });
  });

  it("rolls back and explains when the server refuses", async () => {
    setSavedAction.mockResolvedValue({
      ok: false,
      message: "This price changed — refresh the search and try again.",
    });
    render(<SaveButton {...REF} initialSaved={true} priceIls={89} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Life P3 from Saved" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This price changed");
    expect(screen.getByRole("button", { name: "Remove Life P3 from Saved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("TrackPriceButton", () => {
  it("suggests a target 10% below today's price and creates the alert", async () => {
    createAlertAction.mockResolvedValue({ ok: true, value: { target: "₪80.00" } });
    render(<TrackPriceButton {...REF} currentAgorot={89_00} initialTracking={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Track price of Life P3" }));
    const input = await screen.findByRole("spinbutton", { name: /Alert me when the price drops to/ });
    expect(input).toHaveValue(80);
    expect(screen.getByText(/Today's best landed price is ₪89.00/)).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "75.5");
    await userEvent.click(screen.getByRole("button", { name: "Create alert" }));

    expect(createAlertAction).toHaveBeenCalledWith({
      productId: "aliexpress:1",
      searchText: "אוזניות אלחוטיות",
      targetShekels: "75.5",
      locale: "en",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Change price alert for Life P3" })).toHaveAttribute(
      "title",
      "Alert set below ₪80.00",
    );
  });

  it("keeps the sheet open and shows the server's validation message", async () => {
    createAlertAction.mockResolvedValue({ ok: false, message: "Pick a target below today's price." });
    render(<TrackPriceButton {...REF} currentAgorot={89_00} initialTracking={true} />);

    await userEvent.click(screen.getByRole("button", { name: "Change price alert for Life P3" }));
    await userEvent.click(await screen.findByRole("button", { name: "Update alert" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a target below today's price.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("in Hebrew", () => {
  it("names the buttons in Hebrew and asks the server to answer in Hebrew", async () => {
    setSavedAction.mockResolvedValue({ ok: true, value: { saved: true } });
    createAlertAction.mockResolvedValue({ ok: true, value: { target: "80.00 ₪" } });
    render(
      <>
        <SaveButton {...REF} initialSaved={false} priceIls={89} locale="he" />
        <TrackPriceButton {...REF} currentAgorot={89_00} initialTracking={false} locale="he" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "שמירת Life P3" }));
    expect(setSavedAction).toHaveBeenCalledWith(expect.objectContaining({ locale: "he" }));

    await userEvent.click(screen.getByRole("button", { name: "מעקב מחיר עבור Life P3" }));
    await screen.findByRole("spinbutton", { name: /התראה כשהמחיר יורד אל/ });
    await userEvent.click(screen.getByRole("button", { name: "יצירת התראה" }));
    expect(createAlertAction).toHaveBeenCalledWith(expect.objectContaining({ locale: "he" }));
  });
});

describe("RemoveButton", () => {
  it("sends the page's language with the product id, and shows the server's answer", async () => {
    const action = jest.fn().mockResolvedValue({ ok: false, message: "השמירה לא זמינה כרגע." });
    render(<RemoveButton label="הסרה" action={action} productId="ebay:1" locale="he" />);
    await userEvent.click(screen.getByRole("button", { name: "הסרה" }));
    expect(action).toHaveBeenCalledWith({ productId: "ebay:1", locale: "he" });
    expect(await screen.findByRole("alert")).toHaveTextContent("השמירה לא זמינה כרגע.");
  });
});

describe("retention analytics", () => {
  it("reports a save and an alert only once the server confirmed them", async () => {
    setSavedAction.mockResolvedValueOnce({ ok: false, message: "no" });
    render(<SaveButton {...REF} initialSaved={false} priceIls={89} locale="he" />);
    await userEvent.click(screen.getByRole("button", { name: "שמירת Life P3" }));
    await screen.findByRole("alert");
    expect(tracked).not.toHaveBeenCalled();

    setSavedAction.mockResolvedValueOnce({ ok: true, value: { saved: true } });
    await userEvent.click(screen.getByRole("button", { name: "שמירת Life P3" }));
    await waitFor(() =>
      expect(tracked).toHaveBeenCalledWith("save_item", {
        product_title: "Life P3",
        price_ils: 89,
        locale: "he",
      }),
    );
  });

  it("reports the alert's target price", async () => {
    createAlertAction.mockResolvedValue({ ok: true, value: { target: "₪75.50" } });
    render(<TrackPriceButton {...REF} currentAgorot={89_00} initialTracking={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Track price of Life P3" }));
    const input = await screen.findByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "75.5");
    await userEvent.click(screen.getByRole("button", { name: "Create alert" }));
    await waitFor(() =>
      expect(tracked).toHaveBeenCalledWith("set_price_alert", {
        product_title: "Life P3",
        target_price: 75.5,
        locale: "en",
      }),
    );
  });
});
