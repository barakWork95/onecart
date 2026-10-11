import type { Money } from "@/domain/shared/money";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { ProductSnapshot, SavedItem } from "@/domain/user-lists/product-snapshot";

/**
 * One signed-in (possibly anonymous) user's lists. Implementations are bound
 * to that user — Supabase enforces it with row-level security as well.
 */
export interface UserListsRepository {
  listSaved(): Promise<readonly SavedItem[]>;
  /** Idempotent: saving the same product again refreshes its snapshot. */
  save(snapshot: ProductSnapshot): Promise<SavedItem>;
  removeSaved(productId: string): Promise<void>;

  listAlerts(): Promise<readonly PriceAlert[]>;
  /** Creates, or replaces the target of, the user's alert for this product. */
  upsertAlert(snapshot: ProductSnapshot, target: Money): Promise<PriceAlert>;
  deleteAlert(productId: string): Promise<void>;
}

/** Cross-user access for the scheduled price checker (service role; bypasses RLS). */
export interface AlertCheckRepository {
  listActiveAlerts(limit: number): Promise<readonly PriceAlert[]>;
  saveObservations(alerts: readonly PriceAlert[]): Promise<void>;
}

/** Resolves who is making the request. Request-scoped. */
export interface CurrentUser {
  /** The signed-in user's id, or null — never creates a user (safe while rendering). */
  getUserId(): Promise<string | null>;
  /** Returns the user's id, creating an anonymous user first if needed (Server Actions only). */
  ensureUserId(): Promise<string>;
}
