import type { ProviderId } from "@/domain/shared/provider";

/**
 * A store lists the product but has no offer that ships it to the shopper's
 * country (Amazon's "no featured offers" with `shipping_location=IL`). It has
 * no price, so it never becomes an offer; it tells the shopper "Amazon won't
 * ship this to Israel" next to the stores that will.
 */
export interface UnavailableListing {
  /** `unifiedProductId(provider, providerProductId)`. */
  readonly id: string;
  readonly provider: ProviderId;
  readonly providerProductId: string;
  readonly title: string;
  /** Clean canonical URL, so the shopper can check the store page themselves. */
  readonly productUrl: string;
  readonly imageUrl: string | null;
  readonly reason: "no_offer_to_destination";
}
