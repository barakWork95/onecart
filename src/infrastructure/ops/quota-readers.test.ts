import { ok, err } from "@/domain/shared/result";
import { isExhausted } from "@/domain/ops/status";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { createBudgetQuota } from "@/infrastructure/ops/budget-quota";
import { createEbayQuota, EBAY_RATE_LIMIT_URL } from "@/infrastructure/ops/ebay-quota";
import { createSerpApiQuota } from "@/infrastructure/ops/serpapi-quota";
import type { EbayTokenProvider } from "@/infrastructure/providers/ebay/ebay-oauth";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createSerpApiQuota", () => {
  it("reads the month's usage and what's left (the account endpoint spends no searches)", async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({
        plan_name: "Free Plan",
        searches_per_month: 250,
        this_month_usage: 250,
        total_searches_left: 0,
      }),
    );
    const [reading] = await createSerpApiQuota({ apiKey: "k", fetch: fetchMock }).read();
    expect(reading).toEqual({
      name: "SerpApi searches this month (Amazon)",
      used: 250,
      limit: 250,
      remaining: 0,
      resetsAt: null,
      error: null,
    });
    expect(isExhausted(reading!)).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://serpapi.com/account.json?api_key=k");
  });

  it("reports failures without the URL (it carries the key)", async () => {
    const http = await createSerpApiQuota({ apiKey: "secret-key", fetch: async () => json({}, 401) }).read();
    expect(http[0]).toMatchObject({ remaining: null, error: "HTTP 401" });
    const shape = await createSerpApiQuota({ apiKey: "k", fetch: async () => json({ nope: 1 }) }).read();
    expect(shape[0]?.error).toBe("unexpected response");
    const network = await createSerpApiQuota({
      apiKey: "secret-key",
      fetch: () =>
        Promise.reject(
          Object.assign(new Error("fetch https://serpapi.com/?api_key=secret-key"), { name: "TypeError" }),
        ),
    }).read();
    expect(network[0]?.error).toBe("TypeError");
    expect(JSON.stringify([http, network])).not.toContain("secret-key");
  });
});

describe("createEbayQuota", () => {
  const tokens: EbayTokenProvider = { getToken: async () => ok("app-token"), invalidate: () => undefined };
  const RESPONSE = {
    rateLimits: [
      {
        apiContext: "buy",
        apiName: "Browse",
        resources: [
          {
            name: "buy.browse",
            rates: [
              {
                count: 412,
                limit: 5000,
                remaining: 4588,
                reset: "2026-10-20T07:00:00.000Z",
                timeWindow: 86400,
              },
            ],
          },
        ],
      },
    ],
  };

  it("reads eBay's own count for the Browse API with the app token", async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(RESPONSE));
    const [reading] = await createEbayQuota({ tokens, fetch: fetchMock }).read();
    expect(reading).toEqual({
      name: "eBay Browse API calls today",
      used: 412,
      limit: 5000,
      remaining: 4588,
      resetsAt: "2026-10-20T07:00:00.000Z",
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      EBAY_RATE_LIMIT_URL,
      expect.objectContaining({ headers: { Authorization: "Bearer app-token" } }),
    );
  });

  it("reports token, HTTP, shape and network failures", async () => {
    const noToken: EbayTokenProvider = {
      getToken: async () => err({ kind: "unauthorized", code: "HTTP_401" }),
      invalidate: () => undefined,
    };
    expect(
      (await createEbayQuota({ tokens: noToken, fetch: async () => json(RESPONSE) }).read())[0]?.error,
    ).toBe("token: HTTP_401");
    expect((await createEbayQuota({ tokens, fetch: async () => json({}, 500) }).read())[0]?.error).toBe(
      "HTTP 500",
    );
    expect(
      (await createEbayQuota({ tokens, fetch: async () => json({ rateLimits: [] }) }).read())[0]?.error,
    ).toBe("no buy.browse rate in the response");
    expect((await createEbayQuota({ tokens, fetch: async () => json({ x: 1 }) }).read())[0]?.error).toBe(
      "unexpected response",
    );
    expect(
      (await createEbayQuota({ tokens, fetch: () => Promise.reject(new Error("down")) }).read())[0]?.error,
    ).toBe("Error");
  });
});

describe("createBudgetQuota", () => {
  const NOW = Date.parse("2026-10-19T08:00:00.000Z");
  const day = Math.floor(NOW / 86_400_000);

  it("reads today's counters as the rate limiter keys them", async () => {
    const redis = createInMemoryRedis(() => NOW);
    await redis.set(`budget:day:ebay:${day}`, 37, { ex: 60 });
    await redis.set(`budget-warm:day:amazon:${day}`, 2, { ex: 60 });
    const readings = await createBudgetQuota({
      redis,
      now: () => NOW,
      budgets: [
        { name: "Our eBay budget today", prefix: "budget", subject: "ebay", limit: 4500 },
        { name: "Our Amazon warming budget today", prefix: "budget-warm", subject: "amazon", limit: 2 },
        { name: "Our AliExpress budget today", prefix: "budget", subject: "aliexpress", limit: 2000 },
      ],
    }).read();
    expect(readings.map((r) => [r.name, r.used, r.remaining])).toEqual([
      ["Our eBay budget today", 37, 4463],
      ["Our Amazon warming budget today", 2, 0],
      ["Our AliExpress budget today", 0, 2000],
    ]);
    expect(readings[0]?.resetsAt).toBe("2026-10-20T00:00:00.000Z");
  });

  it("reports a counter it can't read", async () => {
    const redis = { get: () => Promise.reject(new Error("redis down")), set: async () => undefined };
    const [reading] = await createBudgetQuota({
      redis,
      budgets: [{ name: "Our eBay budget today", prefix: "budget", subject: "ebay", limit: 4500 }],
    }).read();
    expect(reading).toMatchObject({ used: null, remaining: null, error: "redis down" });
  });
});
