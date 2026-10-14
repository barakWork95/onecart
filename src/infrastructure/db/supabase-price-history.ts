import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PriceHistoryStore } from "@/domain/deals/ports";
import { RepositoryError } from "@/infrastructure/db/supabase-user-lists";

/** Rows per upsert request. */
const WRITE_CHUNK = 500;
/** Products per history read: 25 × 30 days stays under PostgREST's 1,000-row page. */
const READ_CHUNK = 25;
const TIMEOUT_MS = 10_000;

const historyRowSchema = z.object({
  product_id: z.string(),
  observed_on: z.iso.date(),
  total_agorot: z.number().int().positive(),
});

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `price_observations` through the service-role client (the table has no visitor policies). */
export function createSupabasePriceHistory(client: SupabaseClient): PriceHistoryStore {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  return {
    async record(observations) {
      for (const chunk of chunks(observations, WRITE_CHUNK)) {
        const { error } = await client
          .from("price_observations")
          .upsert(
            chunk.map((o) => ({
              product_id: o.productId,
              provider: o.provider,
              observed_on: o.day,
              total_agorot: o.totalMinor,
              item_agorot: o.itemMinor,
              query: o.query,
              title: o.title,
            })),
            { onConflict: "product_id,observed_on" },
          )
          .abortSignal(signal());
        if (error) throw new RepositoryError("recordPrices", error.message);
      }
    },

    async history(productIds, sinceDay) {
      const rows = [];
      for (const chunk of chunks(productIds, READ_CHUNK)) {
        const { data, error } = await client
          .from("price_observations")
          .select("product_id, observed_on, total_agorot")
          .in("product_id", chunk)
          .gte("observed_on", sinceDay)
          .abortSignal(signal());
        if (error) throw new RepositoryError("priceHistory", error.message);
        rows.push(...historyRowSchema.array().parse(data ?? []));
      }
      return rows.map((r) => ({ productId: r.product_id, day: r.observed_on, totalMinor: r.total_agorot }));
    },

    async prune(beforeDay) {
      const { error } = await client
        .from("price_observations")
        .delete()
        .lt("observed_on", beforeDay)
        .abortSignal(signal());
      if (error) throw new RepositoryError("prunePrices", error.message);
    },
  };
}
