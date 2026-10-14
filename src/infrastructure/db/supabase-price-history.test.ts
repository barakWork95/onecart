import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceObservation } from "@/domain/deals/ports";
import { createSupabasePriceHistory } from "@/infrastructure/db/supabase-price-history";

type Result = { data: unknown; error: { message: string } | null };

/** Records each PostgREST chain; resolves every chain with `respond(chain)`. */
function fakeClient(respond: (chain: string[]) => Result = () => ({ data: [], error: null })) {
  const chains: string[][] = [];
  const from = (table: string) => {
    const chain = [`from(${table})`];
    chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const method of ["upsert", "select", "in", "gte", "lt", "delete", "abortSignal"]) {
      builder[method] = (...args: unknown[]) => {
        chain.push(
          `${method}(${args.map((a) => (a instanceof AbortSignal ? "signal" : JSON.stringify(a))).join(", ")})`,
        );
        return builder;
      };
    }
    builder.then = (resolve: (r: Result) => unknown) => resolve(respond(chain));
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, chains };
}

const observation = (i: number): PriceObservation => ({
  productId: `ebay:${i}`,
  provider: "ebay",
  day: "2026-10-14",
  totalMinor: 500_00,
  itemMinor: 420_00,
  query: "jbl charge 5",
  title: "JBL Charge 5",
});

describe("createSupabasePriceHistory", () => {
  it("upserts one row per product per day, 500 rows a request", async () => {
    const { client, chains } = fakeClient();
    await createSupabasePriceHistory(client).record(Array.from({ length: 501 }, (_, i) => observation(i)));
    expect(chains).toHaveLength(2);
    expect(chains[0]?.[1]).toContain('"product_id":"ebay:0","provider":"ebay","observed_on":"2026-10-14"');
    expect(chains[0]?.[1]).toContain('{"onConflict":"product_id,observed_on"}');
    expect(chains[1]?.[1]).toContain('"product_id":"ebay:500"');
  });

  it("reads history 25 products at a time from a day on", async () => {
    const { client, chains } = fakeClient((chain) => ({
      data: chain.some((c) => c.includes('"ebay:0"'))
        ? [{ product_id: "ebay:0", observed_on: "2026-10-13", total_agorot: 480_00 }]
        : [],
      error: null,
    }));
    const ids = Array.from({ length: 26 }, (_, i) => `ebay:${i}`);
    const rows = await createSupabasePriceHistory(client).history(ids, "2026-09-14");
    expect(rows).toEqual([{ productId: "ebay:0", day: "2026-10-13", totalMinor: 480_00 }]);
    expect(chains).toHaveLength(2);
    expect(chains[0]).toContain('gte("observed_on", "2026-09-14")');
  });

  it("prunes days before a cutoff", async () => {
    const { client, chains } = fakeClient();
    await createSupabasePriceHistory(client).prune("2026-06-16");
    expect(chains[0]).toEqual([
      "from(price_observations)",
      "delete()",
      'lt("observed_on", "2026-06-16")',
      "abortSignal(signal)",
    ]);
  });

  it("throws database errors for the use case to handle", async () => {
    const failing = fakeClient(() => ({ data: null, error: { message: "permission denied" } })).client;
    const store = createSupabasePriceHistory(failing);
    await expect(store.record([observation(1)])).rejects.toThrow("recordPrices: permission denied");
    await expect(store.history(["ebay:1"], "2026-09-14")).rejects.toThrow("priceHistory: permission denied");
    await expect(store.prune("2026-06-16")).rejects.toThrow("prunePrices: permission denied");
  });
});
