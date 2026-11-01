import { render, waitFor } from "@testing-library/react";
import { PhotoMatchCheck } from "@/components/features/search/photo-match-check";

// Next's router is the same object on every render.
const mockRouter = { refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
const refresh = mockRouter.refresh;

// jsdom has no Response: the slice of one the component reads.
const answer = (body: unknown, status = 200) =>
  jest.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("PhotoMatchCheck", () => {
  const params = { q: "monitor stand riser", sort: "landed_price_asc" };

  beforeEach(() => refresh.mockReset());

  it("asks for the photo check once and refreshes the results into the new look-alike cards", async () => {
    const fetchMock = answer({
      regrouped: true,
      pairs: [{ listingIds: ["a", "b"], stores: ["aliexpress", "ebay"] }],
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { container, rerender } = render(<PhotoMatchCheck params={params} />);
    rerender(<PhotoMatchCheck params={{ ...params }} />);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/match/fingerprint-top",
      expect.objectContaining({ method: "POST", body: JSON.stringify(params) }),
    );
    // Nothing of its own on screen: the cards themselves change.
    expect(container).toBeEmptyDOMElement();
  });

  it("leaves the results alone when nothing new grouped, or the check fails", async () => {
    for (const fetchMock of [
      answer({ regrouped: false, pairs: [] }),
      answer({ error: "forbidden" }, 429),
      jest.fn(async () => Promise.reject(new Error("offline"))),
    ]) {
      global.fetch = fetchMock as unknown as typeof fetch;
      const { unmount } = render(<PhotoMatchCheck params={params} />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      unmount();
    }
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancels the check when the shopper moves on", async () => {
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;
    const { unmount } = render(<PhotoMatchCheck params={params} />);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
