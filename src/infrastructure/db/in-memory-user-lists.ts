import type { AlertCheckRepository, UserListsRepository } from "@/domain/user-lists/ports";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { SavedItem } from "@/domain/user-lists/product-snapshot";

/**
 * Per-process store with the same semantics as the Supabase tables
 * (unique per user+product, newest first). Used in demo mode and E2E only —
 * it forgets everything on restart.
 */
export function createInMemoryUserLists(now: () => Date = () => new Date()) {
  const saved = new Map<string, Map<string, SavedItem>>();
  const alerts = new Map<string, Map<string, PriceAlert>>();
  const owners = new Map<string, string>(); // alert id → user id
  let sequence = 0;

  const bucket = <T>(store: Map<string, Map<string, T>>, userId: string) => {
    let entries = store.get(userId);
    if (!entries) store.set(userId, (entries = new Map()));
    return entries;
  };
  const newestFirst = <T extends { readonly id: string }>(items: Iterable<T>, at: (t: T) => string) =>
    [...items].sort((a, b) => at(b).localeCompare(at(a)) || b.id.localeCompare(a.id));
  const nextId = () => `mem-${String(++sequence).padStart(8, "0")}`;

  function forUser(userId: string): UserListsRepository {
    return {
      async listSaved() {
        return newestFirst(bucket(saved, userId).values(), (s) => s.savedAt);
      },
      async save(snapshot) {
        const existing = bucket(saved, userId).get(snapshot.productId);
        const item: SavedItem = {
          ...snapshot,
          id: existing?.id ?? nextId(),
          savedAt: existing?.savedAt ?? now().toISOString(),
        };
        bucket(saved, userId).set(snapshot.productId, item);
        return item;
      },
      async removeSaved(productId) {
        bucket(saved, userId).delete(productId);
      },
      async listAlerts() {
        return newestFirst(bucket(alerts, userId).values(), (a) => a.createdAt);
      },
      async upsertAlert(snapshot, target) {
        const existing = bucket(alerts, userId).get(snapshot.productId);
        const at = now().toISOString();
        const { price, ...rest } = snapshot;
        const alert: PriceAlert = {
          ...rest,
          id: existing?.id ?? nextId(),
          target,
          baseline: price,
          lastSeen: price,
          lastCheckedAt: at,
          status: "active",
          triggeredAt: null,
          createdAt: existing?.createdAt ?? at,
        };
        bucket(alerts, userId).set(snapshot.productId, alert);
        owners.set(alert.id, userId);
        return alert;
      },
      async deleteAlert(productId) {
        const existing = bucket(alerts, userId).get(productId);
        if (existing) owners.delete(existing.id);
        bucket(alerts, userId).delete(productId);
      },
    };
  }

  const alertCheck: AlertCheckRepository = {
    async listActiveAlerts(limit) {
      return [...alerts.values()]
        .flatMap((m) => [...m.values()])
        .filter((a) => a.status === "active")
        .sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? ""))
        .slice(0, limit);
    },
    async saveObservations(updated) {
      for (const alert of updated) {
        const userId = owners.get(alert.id);
        if (userId) bucket(alerts, userId).set(alert.productId, alert);
      }
    },
  };

  return { forUser, alertCheck };
}
