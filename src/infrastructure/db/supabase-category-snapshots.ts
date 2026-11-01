import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CategorySnapshotStore } from "@/domain/deals/ports";
import { RepositoryError } from "@/infrastructure/db/supabase-user-lists";

const TIMEOUT_MS = 5_000;

const rowSchema = z.object({
  page: z.record(z.string(), z.unknown()),
  saved_at: z.iso.datetime({ offset: true }),
});

/** `category_snapshots` through the service-role client (the table has no visitor policies). */
export function createSupabaseCategorySnapshots(client: SupabaseClient): CategorySnapshotStore {
  return {
    async load(slug) {
      const { data, error } = await client
        .from("category_snapshots")
        .select("page, saved_at")
        .eq("slug", slug)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
        .maybeSingle();
      if (error) throw new RepositoryError("category snapshot load", error.message);
      if (!data) return null;
      const row = rowSchema.parse(data);
      // The page's shape is checked by the use case (`isSnapshotPage`), which owns it.
      return { page: row.page, savedAt: new Date(row.saved_at).toISOString() };
    },
    async save(slug, page, savedAt) {
      const { error } = await client
        .from("category_snapshots")
        .upsert({ slug, page, saved_at: savedAt }, { onConflict: "slug" })
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      if (error) throw new RepositoryError("category snapshot save", error.message);
    },
  };
}
