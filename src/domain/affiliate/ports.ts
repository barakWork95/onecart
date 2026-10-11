import type { ProviderId } from "@/domain/shared/provider";

/** Where an outbound click should go, before affiliate tagging. */
export interface OutboundTarget {
  /** UnifiedProduct id, e.g. "amazon:B08KW1KR5H". */
  readonly id: string;
  readonly provider: ProviderId;
  /** The product's clean URL. */
  readonly url: string;
}

/**
 * Turns a target into a tamper-proof `/go/...` href and back. `decode`
 * returns null for anything it didn't sign itself.
 */
export interface OutboundLinkCodec {
  encode(target: OutboundTarget): string;
  decode(id: string, params: Readonly<Record<string, string | undefined>>): OutboundTarget | null;
}

export interface AffiliateLink {
  readonly url: URL;
  /** false when we have no affiliate program configured for this store (link still works). */
  readonly affiliated: boolean;
}

/**
 * Wraps a clean store URL with our affiliate tracking. Async because some
 * stores (AliExpress) issue tracking links via API. Must not throw: on any
 * failure it returns the clean URL with `affiliated: false`.
 */
export interface AffiliateLinkBuilder {
  build(provider: ProviderId, cleanUrl: URL): Promise<AffiliateLink>;
}

export interface OutboundClick {
  readonly productId: string;
  readonly provider: ProviderId;
  readonly affiliated: boolean;
  readonly at: string;
}

/** Click analytics sink (Supabase later). Must not throw into the redirect path. */
export interface ClickRecorder {
  record(click: OutboundClick): void | Promise<void>;
}
