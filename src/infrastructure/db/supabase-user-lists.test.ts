import type { SupabaseClient } from "@supabase/supabase-js";
import { money } from "@/domain/shared/money";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import {
  createSupabaseAlertCheckRepository,
  createSupabaseTriggeredAlertRepository,
  createSupabaseUserListsRepository,
  RepositoryError,
} from "@/infrastructure/db/supabase-user-lists";
import { ALERT_COLUMNS, SAVED_COLUMNS } from "@/infrastructure/db/user-list-rows";

type Result = { data: unknown; error: { message: string } | null };

/**
 * Records the PostgREST query chain (`from().select().eq()...`) and resolves
 * with a canned result, so repository tests can assert exactly what's sent.
 */
function fakeClient(results: Result[] | ((call: string[]) => Result)) {
  const calls: string[][] = [];
  const queue = Array.isArray(results) ? [...results] : null;
  const from = (table: string) => {
    const call = [`from(${table})`];
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "order",
      "upsert",
      "single",
      "delete",
      "update",
      "limit",
      "is",
      "in",
    ]) {
      builder[method] = (...args: unknown[]) => {
        call.push(`${method}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
        return builder;
      };
    }
    builder.then = (resolve: (r: Result) => unknown) =>
      resolve(
        queue
          ? (queue.shift() ?? { data: null, error: { message: "no result queued" } })
          : (results as (c: string[]) => Result)(call),
      );
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const USER = "00000000-0000-0000-0000-00000000000a";
const SAVED_ROW = {
  id: "s1",
  product_id: "aliexpress:1",
  provider: "aliexpress",
  title: "Life P3",
  image_url: null,
  product_url: "https://www.aliexpress.com/item/1.html",
  price_agorot: 8900,
  search_text: "earbuds",
  created_at: "2026-10-11 09:00:00+00",
};
const ALERT_ROW = {
  ...SAVED_ROW,
  id: "a1",
  target_agorot: 8000,
  baseline_agorot: 8900,
  last_seen_agorot: null,
  last_checked_at: null,
  status: "active",
  triggered_at: null,
};
const SNAPSHOT = {
  productId: "aliexpress:1",
  provider: "aliexpress" as const,
  title: "Life P3",
  imageUrl: null,
  productUrl: "https://www.aliexpress.com/item/1.html",
  price: money(89_00, "ILS"),
  searchText: "earbuds",
};

describe("createSupabaseUserListsRepository", () => {
  it("lists the user's saved items, newest first, mapped to domain objects", async () => {
    const { client, calls } = fakeClient([{ data: [SAVED_ROW], error: null }]);
    const items = await createSupabaseUserListsRepository(client, USER).listSaved();
    expect(calls[0]).toEqual([
      "from(saved_items)",
      `select(${JSON.stringify(SAVED_COLUMNS)})`,
      `eq("user_id", "${USER}")`,
      'order("created_at", {"ascending":false})',
    ]);
    expect(items).toEqual([
      {
        id: "s1",
        productId: "aliexpress:1",
        provider: "aliexpress",
        title: "Life P3",
        imageUrl: null,
        productUrl: "https://www.aliexpress.com/item/1.html",
        price: money(89_00, "ILS"),
        searchText: "earbuds",
        savedAt: "2026-10-11T09:00:00.000Z",
      },
    ]);
  });

  it("upserts saves on (user_id, product_id)", async () => {
    const { client, calls } = fakeClient([{ data: SAVED_ROW, error: null }]);
    await createSupabaseUserListsRepository(client, USER).save(SNAPSHOT);
    expect(calls[0]?.[1]).toContain('"user_id":"' + USER + '"');
    expect(calls[0]?.[1]).toContain('"price_agorot":8900');
    expect(calls[0]?.[1]).toContain('{"onConflict":"user_id,product_id"}');
    expect(calls[0]?.slice(-1)).toEqual(["single()"]);
  });

  it("re-arms alerts on upsert", async () => {
    const { client, calls } = fakeClient([{ data: ALERT_ROW, error: null }]);
    const alert = await createSupabaseUserListsRepository(client, USER).upsertAlert(
      SNAPSHOT,
      money(80_00, "ILS"),
    );
    const sent = calls[0]?.[1] ?? "";
    for (const fragment of [
      '"target_agorot":8000',
      '"baseline_agorot":8900',
      '"status":"active"',
      '"triggered_at":null',
    ]) {
      expect(sent).toContain(fragment);
    }
    expect(alert).toMatchObject({ target: money(80_00, "ILS"), status: "active", lastSeen: null });
  });

  it("scopes deletes to the user and product", async () => {
    const { client, calls } = fakeClient([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const repo = createSupabaseUserListsRepository(client, USER);
    await repo.removeSaved("aliexpress:1");
    await repo.deleteAlert("aliexpress:1");
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ["from(saved_items)", "delete()"],
      ["from(price_alerts)", "delete()"],
    ]);
    expect(calls[0]?.slice(2)).toEqual([`eq("user_id", "${USER}")`, 'eq("product_id", "aliexpress:1")']);
  });

  it("lists alerts with timestamps normalized to ISO", async () => {
    const triggered = {
      ...ALERT_ROW,
      status: "triggered",
      triggered_at: "2026-10-12 05:00:00+00",
      last_seen_agorot: 7900,
      last_checked_at: "2026-10-12 05:00:00+00",
    };
    const { client } = fakeClient([{ data: [triggered], error: null }]);
    expect(await createSupabaseUserListsRepository(client, USER).listAlerts()).toEqual([
      expect.objectContaining({
        status: "triggered",
        triggeredAt: "2026-10-12T05:00:00.000Z",
        lastSeen: money(79_00, "ILS"),
      }),
    ]);
  });

  it("throws RepositoryError on database errors and unexpected rows", async () => {
    const failing = fakeClient(() => ({ data: null, error: { message: "permission denied" } })).client;
    const repo = createSupabaseUserListsRepository(failing, USER);
    await expect(repo.listSaved()).rejects.toThrow(new RepositoryError("listSaved", "permission denied"));
    await expect(repo.removeSaved("x")).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.deleteAlert("x")).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.listAlerts()).rejects.toBeInstanceOf(RepositoryError);

    const empty = fakeClient(() => ({ data: null, error: null })).client;
    await expect(createSupabaseUserListsRepository(empty, USER).save(SNAPSHOT)).rejects.toThrow(
      "no data returned",
    );

    const weird = fakeClient(() => ({ data: [{ ...SAVED_ROW, provider: "shein" }], error: null })).client;
    await expect(createSupabaseUserListsRepository(weird, USER).listSaved()).rejects.toThrow();
  });
});

describe("createSupabaseAlertCheckRepository", () => {
  it("lists active alerts, least recently checked first, capped", async () => {
    const { client, calls } = fakeClient([{ data: [ALERT_ROW], error: null }]);
    expect(await createSupabaseAlertCheckRepository(client).listActiveAlerts(100)).toHaveLength(1);
    expect(calls[0]).toEqual([
      "from(price_alerts)",
      `select(${JSON.stringify(ALERT_COLUMNS)})`,
      'eq("status", "active")',
      'order("last_checked_at", {"ascending":true,"nullsFirst":true})',
      "limit(100)",
    ]);
  });

  it("updates only observation columns, by id, in batches", async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    const alert = (i: number): PriceAlert => ({
      id: `a${i}`,
      productId: `aliexpress:${i}`,
      provider: "aliexpress",
      title: "x",
      imageUrl: null,
      productUrl: "https://www.aliexpress.com/item/1.html",
      searchText: "x",
      target: money(80_00, "ILS"),
      baseline: money(89_00, "ILS"),
      lastSeen: i === 0 ? null : money(79_00, "ILS"),
      lastCheckedAt: "2026-10-12T05:00:00.000Z",
      status: "triggered",
      triggeredAt: "2026-10-12T05:00:00.000Z",
      createdAt: "2026-10-10T00:00:00.000Z",
    });
    await createSupabaseAlertCheckRepository(client).saveObservations(
      Array.from({ length: 25 }, (_, i) => alert(i)),
    );
    expect(calls).toHaveLength(25);
    expect(calls[1]).toEqual([
      "from(price_alerts)",
      'update({"last_seen_agorot":7900,"last_checked_at":"2026-10-12T05:00:00.000Z","status":"triggered","triggered_at":"2026-10-12T05:00:00.000Z"})',
      'eq("id", "a1")',
    ]);
    expect(calls[0]?.[1]).toContain('"last_seen_agorot":null');
  });

  it("surfaces update failures", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "timeout" } }));
    await expect(
      createSupabaseAlertCheckRepository(client).saveObservations([{} as PriceAlert]),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe("createSupabaseTriggeredAlertRepository", () => {
  it("lists triggered, unnotified alerts with their owners, oldest trigger first", async () => {
    const triggered = {
      ...ALERT_ROW,
      status: "triggered",
      triggered_at: "2026-10-15 05:00:00+00",
      user_id: USER,
    };
    const { client, calls } = fakeClient([{ data: [triggered], error: null }]);
    const [owned] = await createSupabaseTriggeredAlertRepository(client).listUnnotified(50);
    expect(owned?.userId).toBe(USER);
    expect(owned?.alert).toMatchObject({ id: "a1", status: "triggered" });
    expect(calls[0]).toEqual([
      "from(price_alerts)",
      `select(${JSON.stringify(`${ALERT_COLUMNS}, user_id`)})`,
      'eq("status", "triggered")',
      'is("notified_at", null)',
      'order("triggered_at", {"ascending":true})',
      "limit(50)",
    ]);
  });

  it("stamps notified_at on the given alerts, 100 at a time", async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    const ids = Array.from({ length: 101 }, (_, i) => `a${i}`);
    await createSupabaseTriggeredAlertRepository(client).markNotified(ids, "2026-10-15T05:00:00.000Z");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toBe('update({"notified_at":"2026-10-15T05:00:00.000Z"})');
    expect(calls[1]?.[2]).toBe('in("id", ["a100"])');
  });

  it("throws on database errors", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    const repo = createSupabaseTriggeredAlertRepository(client);
    await expect(repo.listUnnotified(1)).rejects.toThrow("listUnnotified: boom");
    await expect(repo.markNotified(["a1"], "2026-10-15T05:00:00.000Z")).rejects.toThrow("markNotified: boom");
  });
});
