import { NextRequest } from "next/server";
import { hebrewOff, proxy } from "@/proxy";

const PASSWORD = "correct-horse-battery-staple";
let hebrew = "false";
jest.mock("@/config/env", () => ({
  env: () => ({ HEBREW_UI: hebrew === "true", ADMIN_DASHBOARD_PASSWORD: PASSWORD }),
}));

const request = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "https://www.onecartapp.com"), init);
const basic = (password: string) => `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`;

describe("hebrewOff", () => {
  it("answers every /he page with a 404 while the Hebrew interface is off", () => {
    hebrew = "false";
    for (const path of ["/he", "/he/c/headphones", "/he/search?q=jbl"]) {
      expect([path, hebrewOff(request(path))?.status]).toEqual([path, 404]);
    }
    expect(hebrewOff(request("/c/headphones"))).toBeNull();
    // A path merely starting with the letters "he" is an English page.
    expect(hebrewOff(request("/headphones"))).toBeNull();
  });

  it("lets /he through once it's on", () => {
    hebrew = "true";
    expect(hebrewOff(request("/he/c/headphones"))).toBeNull();
  });
});

describe("proxy — abuse limits", () => {
  const hit = async (n: number, make: () => NextRequest) => {
    const statuses: number[] = [];
    for (let i = 0; i < n; i++) statuses.push((await proxy(make())).status);
    return statuses;
  };

  it("throttles /go per IP with a plain 429 and Retry-After", async () => {
    const statuses = await hit(61, () => request("/go/abc", { headers: { "x-real-ip": "203.0.113.10" } }));
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    const refused = await proxy(request("/go/abc", { headers: { "x-real-ip": "203.0.113.10" } }));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    // Another visitor is unaffected.
    expect((await proxy(request("/go/abc", { headers: { "x-real-ip": "203.0.113.11" } }))).status).toBe(200);
  });

  it("throttles Server Action POSTs per IP, whichever page they post to", async () => {
    const make = () =>
      request("/he/alerts", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.20", "next-action": "7f00ab" },
      });
    const statuses = await hit(31, make);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("locks an IP out of /internal after 10 wrong passwords, even for the right one", async () => {
    const ip = { "x-real-ip": "203.0.113.30" };
    const wrong = await hit(10, () =>
      request("/internal/analytics", { headers: { ...ip, authorization: basic("guess-guess-guess-1") } }),
    );
    expect(wrong.every((s) => s === 401)).toBe(true);
    const locked = await proxy(
      request("/internal/analytics", { headers: { ...ip, authorization: basic(PASSWORD) } }),
    );
    expect(locked.status).toBe(429);
    expect(locked.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // The owner from another IP still gets in; the bare password prompt never counts as a failure.
    const owner = { "x-real-ip": "198.51.100.40" };
    expect(
      (await hit(12, () => request("/internal/analytics", { headers: owner }))).every((s) => s === 401),
    ).toBe(true);
    expect(
      (await proxy(request("/internal/analytics", { headers: { ...owner, authorization: basic(PASSWORD) } })))
        .status,
    ).toBe(200);
  });

  it("never throttles requests without a client IP (local runs and E2E)", async () => {
    expect((await hit(70, () => request("/go/abc"))).every((s) => s === 200)).toBe(true);
  });
});
