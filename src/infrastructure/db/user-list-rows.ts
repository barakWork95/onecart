import { z } from "zod";
import { money } from "@/domain/shared/money";
import { PROVIDER_IDS } from "@/domain/shared/provider";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { ProductSnapshot, SavedItem } from "@/domain/user-lists/product-snapshot";

/** Column lists kept next to the schemas so selects and parsing can't drift apart. */
export const SAVED_COLUMNS =
  "id, product_id, provider, title, image_url, product_url, price_agorot, search_text, created_at";
export const ALERT_COLUMNS =
  "id, product_id, provider, title, image_url, product_url, search_text, target_agorot, baseline_agorot, last_seen_agorot, last_checked_at, status, triggered_at, created_at";

const base = {
  id: z.string().min(1),
  product_id: z.string().min(1),
  provider: z.enum(PROVIDER_IDS),
  title: z.string(),
  image_url: z.string().nullable(),
  product_url: z.string(),
  search_text: z.string(),
  created_at: z.string(),
};

export const savedRowSchema = z.object({ ...base, price_agorot: z.number().int().positive() });
export const alertRowSchema = z.object({
  ...base,
  target_agorot: z.number().int().positive(),
  baseline_agorot: z.number().int().positive(),
  last_seen_agorot: z.number().int().positive().nullable(),
  last_checked_at: z.string().nullable(),
  status: z.enum(["active", "triggered"]),
  triggered_at: z.string().nullable(),
});

export type SavedRow = z.infer<typeof savedRowSchema>;
export type AlertRow = z.infer<typeof alertRowSchema>;

/** Postgres returns "2026-10-11 09:00:00+00"; normalize to ISO-8601. */
const iso = (value: string) => new Date(value).toISOString();
const ils = (agorot: number) => money(agorot, "ILS");

export function savedFromRow(row: SavedRow): SavedItem {
  return {
    id: row.id,
    productId: row.product_id,
    provider: row.provider,
    title: row.title,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    price: ils(row.price_agorot),
    searchText: row.search_text,
    savedAt: iso(row.created_at),
  };
}

export function alertFromRow(row: AlertRow): PriceAlert {
  return {
    id: row.id,
    productId: row.product_id,
    provider: row.provider,
    title: row.title,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    searchText: row.search_text,
    target: ils(row.target_agorot),
    baseline: ils(row.baseline_agorot),
    lastSeen: row.last_seen_agorot === null ? null : ils(row.last_seen_agorot),
    lastCheckedAt: row.last_checked_at === null ? null : iso(row.last_checked_at),
    status: row.status,
    triggeredAt: row.triggered_at === null ? null : iso(row.triggered_at),
    createdAt: iso(row.created_at),
  };
}

/** Columns shared by both tables, from a server-built snapshot. */
export function snapshotColumns(snapshot: ProductSnapshot) {
  return {
    product_id: snapshot.productId,
    provider: snapshot.provider,
    title: snapshot.title.slice(0, 300),
    image_url: snapshot.imageUrl,
    product_url: snapshot.productUrl,
    search_text: snapshot.searchText.slice(0, 200),
  };
}

/** The columns the price checker is allowed to change. */
export function observationColumns(alert: PriceAlert) {
  return {
    last_seen_agorot: alert.lastSeen?.amountMinor ?? null,
    last_checked_at: alert.lastCheckedAt,
    status: alert.status,
    triggered_at: alert.triggeredAt,
  };
}
