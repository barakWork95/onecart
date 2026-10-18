import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpsStats } from "@/domain/ops/status";
import { RepositoryError } from "@/infrastructure/db/supabase-user-lists";

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function count(operation: string, query: CountQuery): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new RepositoryError(operation, error.message);
  return n ?? 0;
}

/** Counts for the status page (service role; `head: true`, so no rows are sent). */
export function createSupabaseOpsStats(serviceClient: SupabaseClient): OpsStats {
  const counted = (table: string) => serviceClient.from(table).select("*", { count: "exact", head: true });
  return {
    async priceObservationsByDay(days) {
      return Promise.all(
        days.map(async (day) => ({
          day,
          count: await count("priceObservationsByDay", counted("price_observations").eq("observed_on", day)),
        })),
      );
    },
    async push() {
      const [subscriptions, failingSubscriptions, alertsActive, alertsTriggered, alertsWaiting] =
        await Promise.all([
          count("pushStats", counted("push_subscriptions")),
          count("pushStats", counted("push_subscriptions").gt("failure_count", 0)),
          count("pushStats", counted("price_alerts").eq("status", "active")),
          count("pushStats", counted("price_alerts").eq("status", "triggered")),
          count("pushStats", counted("price_alerts").eq("status", "triggered").is("notified_at", null)),
        ]);
      return { subscriptions, failingSubscriptions, alertsActive, alertsTriggered, alertsWaiting };
    },
  };
}
