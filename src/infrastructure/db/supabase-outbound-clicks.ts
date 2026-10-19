import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ClickAnalyticsReader, ClickRecorder, ClickStatsReader } from "@/domain/affiliate/ports";
import { LOCALES } from "@/domain/shared/locale";
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
          product_title: click.title,
          price_ils: click.priceAgorot === null ? null : click.priceAgorot / 100,
          is_best_deal: click.bestDeal,
          locale: click.locale,
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

const topProductRowSchema = z.object({
  product_id: z.string().min(1),
  provider: z.enum(PROVIDER_IDS),
  title: z.string().nullable(),
  clicks: z.number().int().nonnegative(),
});

const recentRowSchema = z.object({
  clicked_at: z.string().min(1),
  provider: z.enum(PROVIDER_IDS),
  product_id: z.string().min(1),
  product_title: z.string().nullable(),
  // PostgREST may send `numeric` as a string.
  price_ils: z.coerce.number().positive().nullable(),
  is_best_deal: z.boolean(),
  locale: z.enum(LOCALES),
});

/** Top products (the `outbound_click_top_products` view) and the latest clicks. */
export function createSupabaseClickAnalytics(client: SupabaseClient): ClickAnalyticsReader {
  return {
    async topProducts(limit) {
      const { data, error } = await client
        .from("outbound_click_top_products")
        .select("product_id, provider, title, clicks")
        .limit(limit);
      if (error) throw new RepositoryError("topProducts", error.message);
      return topProductRowSchema
        .array()
        .parse(data ?? [])
        .map((r) => ({ productId: r.product_id, provider: r.provider, title: r.title, clicks: r.clicks }));
    },

    async recentClicks(limit) {
      const { data, error } = await client
        .from("outbound_clicks")
        .select("clicked_at, provider, product_id, product_title, price_ils, is_best_deal, locale")
        .order("clicked_at", { ascending: false })
        .limit(limit);
      if (error) throw new RepositoryError("recentClicks", error.message);
      return recentRowSchema
        .array()
        .parse(data ?? [])
        .map((r) => ({
          at: r.clicked_at,
          provider: r.provider,
          productId: r.product_id,
          title: r.product_title,
          priceAgorot: r.price_ils === null ? null : Math.round(r.price_ils * 100),
          bestDeal: r.is_best_deal,
          locale: r.locale,
        }));
    },
  };
}
