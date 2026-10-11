import type { UnifiedProduct } from "@/domain/product/unified-product";
import { money } from "@/domain/shared/money";
import { err, ok, type Result } from "@/domain/shared/result";
import { validateTarget, type PriceAlert, type TargetError } from "@/domain/user-lists/price-alert";
import type { UserListsRepository } from "@/domain/user-lists/ports";
import { snapshotFromOffer, type SavedItem } from "@/domain/user-lists/product-snapshot";

/** Abuse guards; generous for real shoppers. */
export const MAX_SAVED_ITEMS = 200;
export const MAX_PRICE_ALERTS = 50;

/**
 * Looks the product up in (cached) search results for `searchText`. This is
 * how we avoid trusting client-sent titles, prices, or URLs.
 */
export type FindOffer = (productId: string, searchText: string) => Promise<UnifiedProduct | null>;

export interface ProductRef {
  readonly productId: string;
  readonly searchText: string;
}

export type SaveError = "not_found" | "limit_reached";
export type AlertError = SaveError | TargetError;

export interface UserListState {
  readonly savedIds: ReadonlySet<string>;
  readonly alertIds: ReadonlySet<string>;
}

export function createUserListsService(deps: { readonly findOffer: FindOffer }) {
  return {
    async saveProduct(repo: UserListsRepository, ref: ProductRef): Promise<Result<SavedItem, SaveError>> {
      const offer = await deps.findOffer(ref.productId, ref.searchText);
      if (!offer) return err("not_found");
      const saved = await repo.listSaved();
      if (saved.length >= MAX_SAVED_ITEMS && !saved.some((s) => s.productId === offer.id))
        return err("limit_reached");
      return ok(await repo.save(snapshotFromOffer(offer, ref.searchText)));
    },

    removeSaved(repo: UserListsRepository, productId: string): Promise<void> {
      return repo.removeSaved(productId);
    },

    async createAlert(
      repo: UserListsRepository,
      ref: ProductRef & { readonly targetAgorot: number },
    ): Promise<Result<PriceAlert, AlertError>> {
      if (!Number.isSafeInteger(ref.targetAgorot)) return err("target_not_positive");
      const offer = await deps.findOffer(ref.productId, ref.searchText);
      if (!offer) return err("not_found");

      const target = validateTarget(money(ref.targetAgorot, "ILS"), offer.price.total);
      if (!target.ok) return target;

      const alerts = await repo.listAlerts();
      if (alerts.length >= MAX_PRICE_ALERTS && !alerts.some((a) => a.productId === offer.id))
        return err("limit_reached");
      return ok(await repo.upsertAlert(snapshotFromOffer(offer, ref.searchText), target.value));
    },

    deleteAlert(repo: UserListsRepository, productId: string): Promise<void> {
      return repo.deleteAlert(productId);
    },

    /** Which products on screen are already saved / tracked, for button states. */
    async listState(repo: UserListsRepository): Promise<UserListState> {
      const [saved, alerts] = await Promise.all([repo.listSaved(), repo.listAlerts()]);
      return {
        savedIds: new Set(saved.map((s) => s.productId)),
        alertIds: new Set(alerts.map((a) => a.productId)),
      };
    },
  };
}

export type UserListsService = ReturnType<typeof createUserListsService>;
