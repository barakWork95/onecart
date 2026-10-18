import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOpsStats } from "@/infrastructure/db/supabase-ops-stats";

type Result = { count: number | null; error: { message: string; code?: string } | null; status?: number };

function fakeClient(respond: (chain: string[]) => Result) {
  const chains: string[][] = [];
  const from = (table: string) => {
    const chain = [`from(${table})`];
    chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gt", "is"]) {
      builder[method] = (...args: unknown[]) => {
        chain.push(`${method}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
        return builder;
      };
    }
    builder.then = (resolve: (r: Result) => unknown) => resolve(respond(chain));
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, chains };
}

describe("createSupabaseOpsStats", () => {
  it("counts price rows per day without fetching them", async () => {
    const { client, chains } = fakeClient((c) => ({
      count: c.some((x) => x.includes("2026-10-19")) ? 611 : 0,
      error: null,
    }));
    expect(await createSupabaseOpsStats(client).priceObservationsByDay(["2026-10-19", "2026-10-18"])).toEqual(
      [
        { day: "2026-10-19", count: 611 },
        { day: "2026-10-18", count: 0 },
      ],
    );
    expect(chains[0]).toEqual([
      "from(price_observations)",
      'select("*", {"count":"exact","head":true})',
      'eq("observed_on", "2026-10-19")',
    ]);
  });

  it("counts subscriptions and alerts by state", async () => {
    const { client, chains } = fakeClient((c) => ({ count: c.length, error: null }));
    expect(await createSupabaseOpsStats(client).push()).toEqual({
      subscriptions: 2,
      failingSubscriptions: 3,
      alertsActive: 3,
      alertsTriggered: 3,
      alertsWaiting: 4,
    });
    expect(chains[4]).toEqual([
      "from(price_alerts)",
      'select("*", {"count":"exact","head":true})',
      'eq("status", "triggered")',
      'is("notified_at", null)',
    ]);
  });

  it("names the failing count and its HTTP status when the error has no body (HEAD)", async () => {
    const denied = fakeClient((c) =>
      c[0] === "from(price_alerts)"
        ? { count: null, error: { message: "" }, status: 401 }
        : { count: 1, error: null },
    ).client;
    await expect(createSupabaseOpsStats(denied).push()).rejects.toThrow(
      "pushStats price_alerts active: HTTP 401",
    );
    const coded = fakeClient(() => ({ count: null, error: { message: "", code: "42501" } })).client;
    await expect(createSupabaseOpsStats(coded).push()).rejects.toThrow("HTTP ? 42501");
  });

  it("throws database errors, and reads a missing count as zero", async () => {
    const failing = fakeClient(() => ({ count: null, error: { message: "boom" } })).client;
    await expect(createSupabaseOpsStats(failing).push()).rejects.toThrow(
      "pushStats push_subscriptions: boom",
    );
    const empty = fakeClient(() => ({ count: null, error: null })).client;
    expect(await createSupabaseOpsStats(empty).priceObservationsByDay(["2026-10-19"])).toEqual([
      { day: "2026-10-19", count: 0 },
    ]);
  });
});
