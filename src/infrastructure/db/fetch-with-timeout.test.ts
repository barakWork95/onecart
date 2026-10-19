import { fetchWithTimeout } from "@/infrastructure/db/fetch-with-timeout";

/** A fetch that never answers, but rejects when its signal aborts (like the real one). */
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("fetchWithTimeout", () => {
  it("gives up on a hanging request after the deadline", async () => {
    const started = Date.now();
    await expect(fetchWithTimeout(40, hanging)("https://db.example/rest/v1/x")).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("still honors the caller's own abort signal", async () => {
    const controller = new AbortController();
    const pending = fetchWithTimeout(5_000, hanging)("https://db.example/", { signal: controller.signal });
    controller.abort(new Error("caller gave up"));
    await expect(pending).rejects.toThrow("caller gave up");
  });

  it("passes the request through untouched otherwise", async () => {
    const base = jest.fn(async () => new Response("ok"));
    const response = await fetchWithTimeout(1_000, base as unknown as typeof fetch)("https://db.example/", {
      method: "POST",
      headers: { apikey: "k" },
    });
    expect(await response.text()).toBe("ok");
    expect(base).toHaveBeenCalledWith(
      "https://db.example/",
      expect.objectContaining({ method: "POST", headers: { apikey: "k" }, signal: expect.any(AbortSignal) }),
    );
  });
});
