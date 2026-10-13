import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ClickRecorder, ClickStatsReader } from "@/domain/affiliate/ports";
import { PROVIDER_IDS } from "@/domain/shared/provider";
import { RepositoryError } from "@/infrastructure/db/supabase-user-lists";

/**
 * A click write runs after the redirect is sent, but still inside the
 * function's lifetime: a hung Supabase must not keep it running.
 */
const DEFAULT_WRITE_TIMEOUT_MS = 2000;

/**
 * Appends to `outbound_clicks` with the service-role client: the table has
 * RLS and no policies, so visitors can neither write nor read it. Nothing
 * identifying is stored (no IP, user or session).
 */
export function createSupabaseClickRecorder(
  client: SupabaseClient,
  options: { readonly timeoutMs?: number } = {},
): ClickRecorder {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS;
  return {
    async record(click) {
      const { error } = await client
        .from("outbound_clicks")
        .insert({
          product_id: click.productId,
          provider: click.provider,
          affiliated: click.affiliated,
          clicked_at: click.at,
        })
        .abortSignal(AbortSignal.timeout(timeoutMs));
      if (error) throw new RepositoryError("recordClick", error.message);
    },
  };
}

const dailyRowSchema = z.object({
  day: z.iso.date(),
  provider: z.enum(PROVIDER_IDS),
  clicks: z.number().int().nonnegative(),
  affiliated: z.number().int().nonnegative(),
});

/** Reads the `outbound_clicks_daily` view (one row per Israeli day and store). */
export function createSupabaseClickStats(client: SupabaseClient): ClickStatsReader {
  return {
    async dailyClicks(sinceDay) {
      const { data, error } = await client
        .from("outbound_clicks_daily")
        .select("day, provider, clicks, affiliated")
        .gte("day", sinceDay)
        .order("day", { ascending: false });
      if (error) throw new RepositoryError("dailyClicks", error.message);
      return dailyRowSchema.array().parse(data ?? []);
    },
  };
}
