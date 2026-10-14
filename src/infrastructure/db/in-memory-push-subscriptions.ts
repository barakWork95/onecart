import type {
  PushDirectory,
  PushSubscriptionRepository,
  StoredSubscription,
} from "@/domain/notifications/ports";

/** Per-process subscriptions with the Supabase table's semantics. Demo mode and E2E only. */
export function createInMemoryPushSubscriptions() {
  const rows = new Map<string, StoredSubscription>(); // `${userId} ${endpoint}` → row
  const key = (userId: string, endpoint: string) => `${userId} ${endpoint}`;

  function forUser(userId: string): PushSubscriptionRepository {
    return {
      async save(s) {
        rows.set(key(userId, s.endpoint), { ...s, userId, failureCount: 0 });
      },
      async remove(endpoint) {
        rows.delete(key(userId, endpoint));
      },
    };
  }

  const directory: PushDirectory = {
    async subscriptionsFor(userIds) {
      return [...rows.values()].filter((r) => userIds.includes(r.userId));
    },
    async recordDeliveries(outcomes, maxFailures) {
      for (const { subscription: s, result } of outcomes) {
        const k = key(s.userId, s.endpoint);
        const failures = s.failureCount + 1;
        if (result === "sent") rows.set(k, { ...s, failureCount: 0 });
        else if (result === "expired" || failures >= maxFailures) rows.delete(k);
        else rows.set(k, { ...s, failureCount: failures });
      }
    },
  };

  return { forUser, directory };
}
