import { fingerprintTop } from "@/app/_composition";
import { POST } from "@/app/api/match/fingerprint-top/route";

jest.mock("@/app/_composition", () => ({ fingerprintTop: jest.fn() }));
const run = jest.mocked(fingerprintTop);

const ORIGIN = "https://www.onecartapp.com";
const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  POST(
    new Request(`${ORIGIN}/api/match/fingerprint-top`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/match/fingerprint-top", () => {
  beforeEach(() => run.mockReset());

  it("runs the check for the page's search and returns the look-alike cards, uncached", async () => {
    const pairs = [{ listingIds: ["ebay:1", "aliexpress:2"], stores: ["aliexpress", "ebay"] as const }];
    run.mockResolvedValue({
      kind: "checked",
      regrouped: true,
      pairs,
      timings: { search: 40, hash: 820, regroup: 35 },
    });
    const response = await post({ q: "monitor stand riser", sort: "landed_price_asc" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("server-timing")).toBe("search;dur=40, hash;dur=820, regroup;dur=35");
    expect(await response.json()).toEqual({ regrouped: true, pairs });
    expect(run).toHaveBeenCalledWith({ q: "monitor stand riser", sort: "landed_price_asc" });
  });

  it("refuses other sites, malformed bodies and unknown fields without running anything", async () => {
    expect((await post({ q: "x" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ q: "x" }, {})).status).toBe(403);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ q: 7 })).status).toBe(400);
    expect((await post({ q: "x".repeat(501) })).status).toBe(400);
    expect((await post({ q: "x", url: "https://i.ebayimg.com/a.jpg" })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 400 when there's no query to check", async () => {
    run.mockResolvedValue({ kind: "invalid" });
    expect((await post({ q: "   " })).status).toBe(400);
  });
});
