import { createUpstashQuota } from "@/infrastructure/ops/upstash-quota";

const NOW = () => Date.parse("2026-11-01T06:00:00.000Z");
const MANAGEMENT = { email: "ops@example.com", apiKey: "mgmt-key", databaseId: "db-123" };
const QUOTA_ERROR = new Error("ERR max requests limit exceeded. Limit: 500000, Usage: 500000.");
const stats = (monthly: number) =>
  jest.fn(async () => Response.json({ total_monthly_requests: monthly, total_monthly_read_requests: 1 }));

describe("createUpstashQuota", () => {
  it("reads this month's commands from Upstash's management API, warning at 80%", async () => {
    const fetchStats = stats(123_456);
    const [reading] = await createUpstashQuota({
      probe: async () => null,
      management: MANAGEMENT,
      monthlyLimit: 500_000,
      fetch: fetchStats,
      now: NOW,
    }).read();
    expect(reading).toEqual({
      name: "Upstash Redis commands this month",
      used: 123_456,
      limit: 500_000,
      remaining: 376_544,
      resetsAt: "2026-12-01T00:00:00.000Z",
      error: null,
      warnAtShare: 0.8,
      alertOnError: true,
    });
    const [url, init] = fetchStats.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.upstash.com/v2/redis/stats/db-123");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("ops@example.com:mgmt-key").toString("base64")}`,
    );
  });

  it("reports an exhausted quota as none left, from the probe alone", async () => {
    const [reading] = await createUpstashQuota({
      probe: () => Promise.reject(QUOTA_ERROR),
      management: null,
      monthlyLimit: 500_000,
      now: NOW,
    }).read();
    expect(reading).toMatchObject({ used: 500_000, limit: 500_000, remaining: 0, error: null });
  });

  it("reports Redis being unreachable as an outage", async () => {
    const [reading] = await createUpstashQuota({
      probe: () => Promise.reject(new TypeError("fetch failed")),
      management: MANAGEMENT,
      monthlyLimit: 500_000,
      fetch: stats(1),
      now: NOW,
    }).read();
    expect(reading).toMatchObject({ error: "Redis unreachable (fetch failed)", alertOnError: true });
  });

  it("says how to see usage when the management API isn't configured, without calling an outage", async () => {
    const [reading] = await createUpstashQuota({
      probe: async () => null,
      management: null,
      monthlyLimit: 500_000,
      now: NOW,
    }).read();
    expect(reading).toMatchObject({
      used: null,
      limit: 500_000,
      error:
        "usage unknown: set UPSTASH_MANAGEMENT_EMAIL, UPSTASH_MANAGEMENT_API_KEY and UPSTASH_DATABASE_ID",
      alertOnError: false,
    });
  });

  it("treats a failed usage read as a blind spot, not an outage (Redis itself answered)", async () => {
    for (const fetchStats of [
      jest.fn(async () => new Response("no", { status: 401 })),
      jest.fn(async () => Response.json({ unexpected: true })),
      jest.fn(() => Promise.reject(new Error("timeout"))),
    ]) {
      const [reading] = await createUpstashQuota({
        probe: async () => null,
        management: MANAGEMENT,
        monthlyLimit: 500_000,
        fetch: fetchStats,
        now: NOW,
      }).read();
      expect(reading).toMatchObject({ used: null, alertOnError: false });
      expect(reading?.error).toMatch(/^usage unavailable/);
    }
  });
});
