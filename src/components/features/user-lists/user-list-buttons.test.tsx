import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveButton } from "@/components/features/user-lists/save-button";
import { TrackPriceButton } from "@/components/features/user-lists/track-price-button";

const setSavedAction = jest.fn();
const createAlertAction = jest.fn();
jest.mock("@/app/[lang]/saved/actions", () => ({
  setSavedAction: (input: unknown) => setSavedAction(input),
}));
jest.mock("@/app/[lang]/alerts/actions", () => ({
  createAlertAction: (input: unknown) => createAlertAction(input),
}));

beforeEach(() => {
  setSavedAction.mockReset();
  createAlertAction.mockReset();
});

const REF = { productId: "aliexpress:1", searchText: "אוזניות אלחוטיות", title: "Life P3" };

describe("SaveButton", () => {
  it("saves optimistically, sending only the product id and search", async () => {
    setSavedAction.mockResolvedValue({ ok: true, value: { saved: true } });
    render(<SaveButton {...REF} initialSaved={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Save Life P3" }));
    expect(screen.getByRole("button", { name: "Remove Life P3 from Saved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(setSavedAction).toHaveBeenCalledWith({
      productId: "aliexpress:1",
      searchText: "אוזניות אלחוטיות",
      saved: true,
    });
  });

  it("rolls back and explains when the server refuses", async () => {
    setSavedAction.mockResolvedValue({
      ok: false,
      message: "This price changed — refresh the search and try again.",
    });
    render(<SaveButton {...REF} initialSaved={true} />);

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
