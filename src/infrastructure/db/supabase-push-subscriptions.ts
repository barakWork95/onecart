import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PushDirectory, PushSubscriptionRepository } from "@/domain/notifications/ports";
import { RepositoryError } from "@/infrastructure/db/supabase-user-lists";

function check(operation: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new RepositoryError(operation, result.error.message);
}

/**
 * One user's subscriptions on a request-scoped client carrying their JWT.
 * RLS limits it to their rows; the explicit user_id is defense in depth.
 */
export function createSupabasePushSubscriptions(
  client: SupabaseClient,
  userId: string,
): PushSubscriptionRepository {
  return {
    async save(subscription) {
      check(
        "savePushSubscription",
        await client.from("push_subscriptions").upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            failure_count: 0,
          },
          { onConflict: "user_id,endpoint" },
        ),
      );
    },
    async remove(endpoint) {
      check(
        "removePushSubscription",
        await client.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint),
      );
    },
  };
}

const subscriptionRowSchema = z.object({
  user_id: z.string().min(1),
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  failure_count: z.number().int().nonnegative(),
});

/** Cross-user subscriptions for the daily sender. Service-role client only. */
export function createSupabasePushDirectory(
  serviceClient: SupabaseClient,
  now: () => Date = () => new Date(),
): PushDirectory {
  return {
    async subscriptionsFor(userIds) {
      const out = [];
      for (let i = 0; i < userIds.length; i += 100) {
        const { data, error } = await serviceClient
          .from("push_subscriptions")
          .select("user_id, endpoint, p256dh, auth, failure_count")
          .in("user_id", userIds.slice(i, i + 100));
        if (error) throw new RepositoryError("pushSubscriptionsFor", error.message);
        out.push(...subscriptionRowSchema.array().parse(data ?? []));
      }
      return out.map((r) => ({
        userId: r.user_id,
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
        failureCount: r.failure_count,
      }));
    },

    async recordDeliveries(outcomes, maxFailures) {
      const at = now().toISOString();
      for (const { subscription: s, result } of outcomes) {
        const target = serviceClient.from("push_subscriptions");
        const failures = s.failureCount + 1;
        const query =
          result === "sent"
            ? target.update({ last_success_at: at, failure_count: 0 })
            : result === "expired" || failures >= maxFailures
              ? target.delete()
              : target.update({ failure_count: failures });
        check("recordDelivery", await query.eq("user_id", s.userId).eq("endpoint", s.endpoint));
      }
    },
  };
}
