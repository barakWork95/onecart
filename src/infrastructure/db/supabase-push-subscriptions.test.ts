import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredSubscription } from "@/domain/notifications/ports";
import {
  createSupabasePushDirectory,
  createSupabasePushSubscriptions,
} from "@/infrastructure/db/supabase-push-subscriptions";

type Result = { data: unknown; error: { message: string } | null };

function fakeClient(respond: (chain: string[]) => Result = () => ({ data: [], error: null })) {
  const chains: string[][] = [];
  const from = (table: string) => {
    const chain = [`from(${table})`];
    chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const method of ["upsert", "select", "in", "eq", "delete", "update"]) {
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

const USER = "00000000-0000-0000-0000-0000000000c1";
const KEYS = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: "p".repeat(87),
  auth: "a".repeat(22),
};
const STORED: StoredSubscription = { ...KEYS, userId: USER, failureCount: 2 };

describe("createSupabasePushSubscriptions", () => {
  it("upserts per user and endpoint, resetting failures; removes by endpoint", async () => {
    const { client, chains } = fakeClient(() => ({ data: null, error: null }));
    const repo = createSupabasePushSubscriptions(client, USER);
    await repo.save(KEYS);
    await repo.remove(KEYS.endpoint);
    expect(chains[0]).toEqual([
      "from(push_subscriptions)",
      `upsert(${JSON.stringify({ user_id: USER, ...KEYS, failure_count: 0 })}, {"onConflict":"user_id,endpoint"})`,
    ]);
    expect(chains[1]).toEqual([
      "from(push_subscriptions)",
      "delete()",
      `eq("user_id", "${USER}")`,
      `eq("endpoint", "${KEYS.endpoint}")`,
    ]);
  });

  it("throws on database errors", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "new row violates check" } }));
    await expect(createSupabasePushSubscriptions(client, USER).save(KEYS)).rejects.toThrow(
      "savePushSubscription: new row violates check",
    );
  });
});

describe("createSupabasePushDirectory", () => {
  it("reads subscriptions for users, 100 at a time", async () => {
    const { client, chains } = fakeClient((chain) => ({
      data: chain.some((c) => c.includes(USER)) ? [{ user_id: USER, ...KEYS, failure_count: 2 }] : [],
      error: null,
    }));
    const users = [USER, ...Array.from({ length: 100 }, (_, i) => `u${i}`)];
    expect(await createSupabasePushDirectory(client).subscriptionsFor(users)).toEqual([STORED]);
    expect(chains).toHaveLength(2);
  });

  it("records deliveries: success resets, expiry deletes, failures count up to the limit", async () => {
    const { client, chains } = fakeClient(() => ({ data: null, error: null }));
    const directory = createSupabasePushDirectory(client, () => new Date("2026-10-15T05:00:00.000Z"));
    await directory.recordDeliveries(
      [
        { subscription: STORED, result: "sent" },
        { subscription: STORED, result: "expired" },
        { subscription: STORED, result: "failed" },
        { subscription: { ...STORED, failureCount: 4 }, result: "failed" },
      ],
      5,
    );
    expect(chains.map((c) => c[1])).toEqual([
      'update({"last_success_at":"2026-10-15T05:00:00.000Z","failure_count":0})',
      "delete()",
      'update({"failure_count":3})',
      "delete()",
    ]);
    expect(chains[0]?.slice(2)).toEqual([`eq("user_id", "${USER}")`, `eq("endpoint", "${KEYS.endpoint}")`]);
  });

  it("throws on database errors", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    const directory = createSupabasePushDirectory(client);
    await expect(directory.subscriptionsFor([USER])).rejects.toThrow("pushSubscriptionsFor: boom");
    await expect(directory.recordDeliveries([{ subscription: STORED, result: "sent" }], 5)).rejects.toThrow(
      "recordDelivery: boom",
    );
  });
});
