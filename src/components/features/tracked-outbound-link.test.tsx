import { fireEvent, render, screen } from "@testing-library/react";
import { track } from "@vercel/analytics";
import { TrackedOutboundLink } from "@/components/features/tracked-outbound-link";

jest.mock("@vercel/analytics", () => ({ track: jest.fn() }));
const tracked = track as jest.MockedFunction<typeof track>;

const CLICK = {
  store: "aliexpress",
  product_title: "Soundcore Life P3",
  price_ils: 89,
  is_best_deal: true,
  locale: "he",
} as const;

beforeEach(() => tracked.mockReset());

describe("TrackedOutboundLink", () => {
  it("is a normal outbound link that reports the click, without stopping it", () => {
    render(
      <TrackedOutboundLink href="/go/aliexpress%3A1" click={CLICK}>
        Go
      </TrackedOutboundLink>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/go/aliexpress%3A1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "nofollow sponsored noopener noreferrer");
    // fireEvent returns false only if a handler called preventDefault().
    expect(fireEvent.click(link)).toBe(true);
    expect(tracked).toHaveBeenCalledWith("outbound_click", CLICK);
  });

  it("reports a middle-click too, but not a right-click", () => {
    render(
      <TrackedOutboundLink href="/go/x" click={CLICK}>
        Go
      </TrackedOutboundLink>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    expect(tracked).not.toHaveBeenCalled();
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(tracked).toHaveBeenCalledTimes(1);
  });
});
