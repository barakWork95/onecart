import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCategorySnapshots } from "@/infrastructure/db/supabase-category-snapshots";

type Result = { data: unknown; error: { message: string } | null };

/** Records each PostgREST chain; resolves every chain with `respond(chain)`. */
function fakeClient(respond: (chain: string[]) => Result) {
  const chains: string[][] = [];
  const from = (table: string) => {
    const chain = [`from(${table})`];
    chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const method of ["upsert", "select", "eq", "maybeSingle", "abortSignal"]) {
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

const PAGE = { indexable: true, products: [], pricesAsOf: null };

describe("createSupabaseCategorySnapshots", () => {
  it("loads one category's snapshot by slug", async () => {
    const { client, chains } = fakeClient(() => ({
      data: { page: { indexable: true }, saved_at: "2026-10-31T07:31:00+00:00" },
      error: null,
    }));
    expect(await createSupabaseCategorySnapshots(client).load("headphones")).toEqual({
      page: { indexable: true },
      savedAt: "2026-10-31T07:31:00.000Z",
    });
    expect(chains[0]).toEqual([
      "from(category_snapshots)",
      'select("page, saved_at")',
      'eq("slug", "headphones")',
      "abortSignal(signal)",
      "maybeSingle()",
    ]);
  });

  it("reads no row as no snapshot, and throws on an error or a malformed row", async () => {
    expect(
      await createSupabaseCategorySnapshots(fakeClient(() => ({ data: null, error: null })).client).load("x"),
    ).toBeNull();
    await expect(
      createSupabaseCategorySnapshots(
        fakeClient(() => ({ data: null, error: { message: "boom" } })).client,
      ).load("x"),
    ).rejects.toThrow("boom");
    await expect(
      createSupabaseCategorySnapshots(fakeClient(() => ({ data: { page: 1 }, error: null })).client).load(
        "x",
      ),
    ).rejects.toThrow();
  });

  it("upserts a snapshot by slug", async () => {
    const { client, chains } = fakeClient(() => ({ data: null, error: null }));
    await createSupabaseCategorySnapshots(client).save("headphones", PAGE, "2026-11-01T07:31:00.000Z");
    expect(chains[0]).toEqual([
      "from(category_snapshots)",
      `upsert(${JSON.stringify({ slug: "headphones", page: PAGE, saved_at: "2026-11-01T07:31:00.000Z" })}, ${JSON.stringify({ onConflict: "slug" })})`,
      "abortSignal(signal)",
    ]);
    await expect(
      createSupabaseCategorySnapshots(
        fakeClient(() => ({ data: null, error: { message: "denied" } })).client,
      ).save("headphones", PAGE, "2026-11-01T07:31:00.000Z"),
    ).rejects.toThrow("denied");
  });
});
