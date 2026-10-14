import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  AlertCheckRepository,
  TriggeredAlertRepository,
  UserListsRepository,
} from "@/domain/user-lists/ports";
import {
  ALERT_COLUMNS,
  alertFromRow,
  alertRowSchema,
  observationColumns,
  SAVED_COLUMNS,
  savedFromRow,
  savedRowSchema,
  snapshotColumns,
} from "@/infrastructure/db/user-list-rows";

export class RepositoryError extends Error {
  constructor(operation: string, detail: string) {
    super(`${operation}: ${detail}`);
    this.name = "RepositoryError";
  }
}

function unwrap<T>(operation: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new RepositoryError(operation, result.error.message);
  if (result.data === null) throw new RepositoryError(operation, "no data returned");
  return result.data;
}

function check(operation: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new RepositoryError(operation, result.error.message);
}

/**
 * Per-user repository on a request-scoped client carrying the user's JWT.
 * RLS already restricts rows to the user; the explicit `user_id` filters are
 * defense in depth and let Postgres use the unique index.
 */
export function createSupabaseUserListsRepository(
  client: SupabaseClient,
  userId: string,
): UserListsRepository {
  return {
    async listSaved() {
      const rows = unwrap(
        "listSaved",
        await client
          .from("saved_items")
          .select(SAVED_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      );
      return savedRowSchema.array().parse(rows).map(savedFromRow);
    },

    async save(snapshot) {
      const row = unwrap(
        "save",
        await client
          .from("saved_items")
          .upsert(
            { user_id: userId, ...snapshotColumns(snapshot), price_agorot: snapshot.price.amountMinor },
            { onConflict: "user_id,product_id" },
          )
          .select(SAVED_COLUMNS)
          .single(),
      );
      return savedFromRow(savedRowSchema.parse(row));
    },

    async removeSaved(productId) {
      check(
        "removeSaved",
        await client.from("saved_items").delete().eq("user_id", userId).eq("product_id", productId),
      );
    },

    async listAlerts() {
      const rows = unwrap(
        "listAlerts",
        await client
          .from("price_alerts")
          .select(ALERT_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      );
      return alertRowSchema.array().parse(rows).map(alertFromRow);
    },

    async upsertAlert(snapshot, target) {
      const now = new Date().toISOString();
      const row = unwrap(
        "upsertAlert",
        await client
          .from("price_alerts")
          .upsert(
            {
              user_id: userId,
              ...snapshotColumns(snapshot),
              target_agorot: target.amountMinor,
              // Re-creating an alert re-arms it from today's price.
              baseline_agorot: snapshot.price.amountMinor,
              last_seen_agorot: snapshot.price.amountMinor,
              last_checked_at: now,
              status: "active",
              triggered_at: null,
              // Re-armed: its next trigger is news again.
              notified_at: null,
            },
            { onConflict: "user_id,product_id" },
          )
          .select(ALERT_COLUMNS)
          .single(),
      );
      return alertFromRow(alertRowSchema.parse(row));
    },

    async deleteAlert(productId) {
      check(
        "deleteAlert",
        await client.from("price_alerts").delete().eq("user_id", userId).eq("product_id", productId),
      );
    },
  };
}

/** Service-role repository for the price checker. Never expose this client to user requests. */
export function createSupabaseAlertCheckRepository(serviceClient: SupabaseClient): AlertCheckRepository {
  return {
    async listActiveAlerts(limit) {
      const rows = unwrap(
        "listActiveAlerts",
        await serviceClient
          .from("price_alerts")
          .select(ALERT_COLUMNS)
          .eq("status", "active")
          // Least recently checked first, so a capped batch still reaches everyone over time.
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(limit),
      );
      return alertRowSchema.array().parse(rows).map(alertFromRow);
    },

    async saveObservations(alerts) {
      // Small concurrent batches: bounded load, no all-or-nothing failure.
      for (let i = 0; i < alerts.length; i += 20) {
        const results = await Promise.all(
          alerts
            .slice(i, i + 20)
            .map((alert) =>
              serviceClient.from("price_alerts").update(observationColumns(alert)).eq("id", alert.id),
            ),
        );
        for (const result of results) check("saveObservations", result);
      }
    },
  };
}

const ownedAlertRowSchema = alertRowSchema.extend({ user_id: z.string().min(1) });

/** Service-role repository for notifying triggered alerts. Never expose this client to user requests. */
export function createSupabaseTriggeredAlertRepository(
  serviceClient: SupabaseClient,
): TriggeredAlertRepository {
  return {
    async listUnnotified(limit) {
      const rows = unwrap(
        "listUnnotified",
        await serviceClient
          .from("price_alerts")
          .select(`${ALERT_COLUMNS}, user_id`)
          .eq("status", "triggered")
          .is("notified_at", null)
          .order("triggered_at", { ascending: true })
          .limit(limit),
      );
      return ownedAlertRowSchema
        .array()
        .parse(rows)
        .map((row) => ({ userId: row.user_id, alert: alertFromRow(row) }));
    },

    async markNotified(alertIds, at) {
      for (let i = 0; i < alertIds.length; i += 100) {
        check(
          "markNotified",
          await serviceClient
            .from("price_alerts")
            .update({ notified_at: at })
            .in("id", alertIds.slice(i, i + 100)),
        );
      }
    },
  };
}
