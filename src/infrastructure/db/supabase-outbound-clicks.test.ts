import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseClickAnalytics,
  createSupabaseClickRecorder,
  createSupabaseClickStats,
} from "@/infrastructure/db/supabase-outbound-clicks";

type Result = { data: unknown; error: { message: string } | null };

/** Records the PostgREST chain and resolves with `result`. */
function fakeClient(result: Result) {
  const calls: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "select", "gte", "order", "limit", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push(
        `${method}(${args.map((a) => (a instanceof AbortSignal ? "signal" : JSON.stringify(a))).join(", ")})`,
      );
      return builder;
    };
  }
  builder.then = (resolve: (r: Result) => unknown) => resolve(result);
  const from = (table: string) => {
    calls.push(`from(${table})`);
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const CLICK = {
  productId: "ebay:v1|123|0",
  provider: "ebay" as const,
  affiliated: true,
  at: "2026-10-13T09:00:00.000Z",
  title: "JBL Charge 5",
  priceAgorot: 612_12,
  bestDeal: true,
  locale: "he" as const,
};

describe("createSupabaseClickRecorder", () => {
  it("inserts one row per click, bounded by a timeout", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await createSupabaseClickRecorder(client).record(CLICK);
    expect(calls).toEqual([
      "from(outbound_clicks)",
      `insert(${JSON.stringify({
        product_id: "ebay:v1|123|0",
        provider: "ebay",
        affiliated: true,
        clicked_at: "2026-10-13T09:00:00.000Z",
        product_title: "JBL Charge 5",
        price_ils: 612.12,
        is_best_deal: true,
        locale: "he",
      })})`,
      "abortSignal(signal)",
    ]);
  });

  it("throws on a database error (the use case logs it)", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied" } });
    await expect(createSupabaseClickRecorder(client, { timeoutMs: 50 }).record(CLICK)).rejects.toThrow(
      "recordClick: permission denied",
    );
  });
});

describe("createSupabaseClickStats", () => {
  it("reads the daily view from a given day, newest first", async () => {
    const rows = [{ day: "2026-10-13", provider: "amazon", clicks: 4, affiliated: 3 }];
    const { client, calls } = fakeClient({ data: rows, error: null });
    expect(await createSupabaseClickStats(client).dailyClicks("2026-09-14")).toEqual(rows);
    expect(calls).toEqual([
      "from(outbound_clicks_daily)",
      'select("day, provider, clicks, affiliated")',
      'gte("day", "2026-09-14")',
      'order("day", {"ascending":false})',
    ]);
  });

  it("treats no data as no clicks", async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await createSupabaseClickStats(client).dailyClicks("2026-09-14")).toEqual([]);
  });

  it("rejects rows that don't match the view's shape, and database errors", async () => {
    const bad = fakeClient({
      data: [{ day: "2026-10-13", provider: "shein", clicks: 1, affiliated: 0 }],
      error: null,
    });
    await expect(createSupabaseClickStats(bad.client).dailyClicks("2026-09-14")).rejects.toThrow();
    const failing = fakeClient({ data: null, error: { message: "relation does not exist" } });
    await expect(createSupabaseClickStats(failing.client).dailyClicks("2026-09-14")).rejects.toThrow(
      "dailyClicks: relation does not exist",
    );
  });
});

describe("createSupabaseClickAnalytics", () => {
  it("reads the most-clicked products of the last 30 days", async () => {
    const rows = [{ product_id: "ebay:1", provider: "ebay", title: "JBL Charge 5", clicks: 12 }];
    const { client, calls } = fakeClient({ data: rows, error: null });
    expect(await createSupabaseClickAnalytics(client).topProducts(10)).toEqual([
      { productId: "ebay:1", provider: "ebay", title: "JBL Charge 5", clicks: 12 },
    ]);
    expect(calls).toEqual([
      "from(outbound_click_top_products)",
      'select("product_id, provider, title, clicks")',
      "limit(10)",
    ]);
  });

  it("reads the latest clicks, newest first (older rows have no title or price)", async () => {
    const rows = [
      {
        clicked_at: "2026-10-19T09:00:00+00:00",
        provider: "aliexpress",
        product_id: "aliexpress:1",
        product_title: "Cable clips",
        price_ils: 12.4,
        is_best_deal: true,
        locale: "he",
      },
      {
        clicked_at: "2026-10-13T09:00:00+00:00",
        provider: "amazon",
        product_id: "amazon:B1",
        product_title: null,
        price_ils: null,
        is_best_deal: false,
        locale: "en",
      },
    ];
    const { client, calls } = fakeClient({ data: rows, error: null });
    const recent = await createSupabaseClickAnalytics(client).recentClicks(50);
    expect(recent[0]).toEqual({
      at: "2026-10-19T09:00:00+00:00",
      provider: "aliexpress",
      productId: "aliexpress:1",
      title: "Cable clips",
      priceAgorot: 12_40,
      bestDeal: true,
      locale: "he",
    });
    expect(recent[1]).toMatchObject({ title: null, priceAgorot: null, bestDeal: false });
    expect(calls).toEqual([
      "from(outbound_clicks)",
      'select("clicked_at, provider, product_id, product_title, price_ils, is_best_deal, locale")',
      'order("clicked_at", {"ascending":false})',
      "limit(50)",
    ]);
  });

  it("throws database errors for both reads", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    const analytics = createSupabaseClickAnalytics(client);
    await expect(analytics.topProducts(10)).rejects.toThrow("topProducts: boom");
    await expect(analytics.recentClicks(50)).rejects.toThrow("recentClicks: boom");
  });
});
