import type { IsoDateTime, UnifiedProduct } from "@/domain/product/unified-product";
import type { Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * What we remember about a product when a user saves it or tracks its price.
 * Always built server-side from a search result — never from client input.
 */
export interface ProductSnapshot {
  readonly productId: string;
  readonly provider: ProviderId;
  readonly title: string;
  readonly imageUrl: string | null;
  readonly productUrl: string;
  /** Landed total in ILS when captured. */
  readonly price: Money;
  /** The user's original search text — re-run to refresh the price. */
  readonly searchText: string;
}

export function snapshotFromOffer(offer: UnifiedProduct, searchText: string): ProductSnapshot {
  return {
    productId: offer.id,
    provider: offer.provider,
    title: offer.title,
    imageUrl: offer.imageUrl,
    productUrl: offer.productUrl,
    price: offer.price.total,
    searchText,
  };
}

export interface SavedItem extends ProductSnapshot {
  readonly id: string;
  readonly savedAt: IsoDateTime;
}
