import type { IsoDateTime, UnifiedProduct } from "@/domain/product/unified-product";

export const DEAL_CATEGORIES = [
  "tech",
  "home",
  "fashion",
  "beauty",
  "auto",
  "sports",
  "kids",
  "other",
] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];

export type DealBadge = "best_price" | "price_drop" | "trending" | "fastest" | "free_shipping";

/** Where the deal came from — the feed must never trigger a live provider call. */
export type DealSource =
  /** Promoted from a recent cached search result. */
  | "search_cache"
  /** Hand-picked by an editor in Supabase. */
  | "curated"
  /** Detected by the price-history job. */
  | "price_drop_job";

export interface DealFeedItem {
  readonly id: string;
  /** Snapshot at the time the deal was captured; price may be stale — show `capturedAt`. */
  readonly product: UnifiedProduct;
  readonly category: DealCategory;
  /** 0–100, derived from `product.originalPrice` vs `product.price.item`; null when no reference price. */
  readonly discountPercent: number | null;
  readonly badges: readonly DealBadge[];
  /** Ranking score; higher shows first. Computed server-side, opaque to the UI. */
  readonly score: number;
  readonly source: DealSource;
  readonly capturedAt: IsoDateTime;
  /** Deal drops out of the feed after this time. */
  readonly expiresAt: IsoDateTime;
}
