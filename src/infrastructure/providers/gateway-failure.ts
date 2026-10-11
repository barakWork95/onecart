import type { ProviderErrorKind } from "@/domain/search/product-search-provider";

/** Transport-level failure from a store API, before it's attributed to a provider/feature. */
export interface GatewayFailure {
  readonly kind: ProviderErrorKind;
  readonly code: string;
  readonly detail?: string;
}
